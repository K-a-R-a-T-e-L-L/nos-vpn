import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { enqueuePaymentAdminNotification } from './payment-admin-notification.outbox'
import type { PaymentCanonicalProcessingService } from './payment-canonical-processing.service'
import { PaymentProviderRoutingService } from './payment-provider-routing.service'
import {
    PAYMENT_CANONICAL_PROCESSING,
    PAYMENT_SUBSCRIPTION_ORCHESTRATOR,
    PAYMENT_SUBSCRIPTION_SERVICE,
} from './payment-service.tokens'
import { PaymentSideEffectsService } from './payment-side-effects.service'
import type { SubscriptionLifecycleOrchestrator } from '../../subscription/services/subscription-lifecycle.orchestrator'
import type { SubscriptionService } from '../../subscription/services/subscription.service'
import { PaymentWebhookEvent } from '../entity/payment-webhook-event.entity'
import { Payment } from '../entity/payment.entity'
import { PaymentActivationStatus } from '../enum/payment-activation-status.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PLATEGA_PROVIDER, ParsedPlategaPayment, PlategaPaymentProvider } from '../providers/platega-payment.provider'
import { YooKassaPaymentProvider } from '../providers/yookassa-payment.provider'

@Injectable()
export class PaymentStatusService {
    private readonly logger = new Logger('PaymentService')

    constructor(
        @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
        @InjectRepository(PaymentWebhookEvent)
        private readonly webhookEventRepository: Repository<PaymentWebhookEvent>,
        @Inject(PAYMENT_SUBSCRIPTION_SERVICE) private readonly subscriptionService: SubscriptionService,
        @Inject(PAYMENT_SUBSCRIPTION_ORCHESTRATOR)
        private readonly orchestrator: SubscriptionLifecycleOrchestrator,
        private readonly plategaProvider: PlategaPaymentProvider,
        private readonly yookassaProvider: YooKassaPaymentProvider,
        private readonly paymentProviderRouting: PaymentProviderRoutingService,
        @Inject(PAYMENT_CANONICAL_PROCESSING)
        @Optional()
        private readonly canonicalProcessing: PaymentCanonicalProcessingService | undefined,
        private readonly paymentSideEffects: PaymentSideEffectsService,
    ) {}

    async handlePlategaWebhook(data: any, headers: Record<string, any>, rawBody?: Buffer | string) {
        let signatureValid = false
        let parsed: ParsedPlategaPayment | null = null
        let eventLog: PaymentWebhookEvent | null = null

        try {
            parsed = this.plategaProvider.parseWebhook(data)
            const idempotencyKey = this.buildWebhookIdempotencyKey(parsed)
            try {
                signatureValid = this.plategaProvider.verifyWebhook(data, headers, rawBody)
            } catch (error: any) {
                eventLog = await this.findOrCreateWebhookEvent(parsed, data, headers, false, idempotencyKey)
                eventLog.processingError = error?.message || 'Webhook verification failed'
                await this.webhookEventRepository.save(eventLog)
                throw error
            }

            eventLog = await this.findOrCreateWebhookEvent(parsed, data, headers, signatureValid, idempotencyKey)

            if (eventLog.processed) {
                return { ok: true, duplicate: true }
            }

            const result = await this.processParsedPlategaPayment(parsed)
            eventLog.processed = true
            eventLog.processedAt = new Date()
            eventLog.status = parsed.status
            await this.webhookEventRepository.save(eventLog)
            return result
        } catch (error: any) {
            if (eventLog) {
                eventLog.processingError = error?.message || 'unknown'
                await this.webhookEventRepository.save(eventLog)
            }
            this.logger.error(`Platega webhook failed: ${error?.message || 'unknown'}; stack=${error?.stack || 'n/a'}`)
            throw error
        }
    }

    async checkLatestPendingPaymentForUser(userId: string) {
        const payment = await this.paymentRepository.findOne({
            where: { userId, status: PaymentStatusEnum.PENDING },
            order: { createdAt: 'DESC' },
        })

        if (!payment) {
            return { ok: true, status: null, message: 'no_pending_payment' }
        }

        return this.checkPaymentForUser(payment.id, userId)
    }

    async checkPaymentForUser(paymentId: string, userId: string) {
        const payment = await this.paymentRepository.findOne({ where: { id: paymentId } })

        if (!payment) {
            return { ok: true, status: null, message: 'payment_not_found' }
        }

        if (payment.userId !== userId) {
            return { ok: true, status: null, message: 'payment_not_found' }
        }

        if (payment.provider === 'yookassa') {
            if (!payment.providerPaymentId || !payment.merchant) {
                return {
                    ok: true,
                    paymentId: payment.id,
                    status: payment.status,
                    message: 'missing_provider_payment_id',
                }
            }
            try {
                const canonical = await this.yookassaProvider.getPayment({
                    providerPaymentId: payment.providerPaymentId,
                    merchant: payment.merchant,
                })
                if (!this.canonicalProcessing) throw new Error('Canonical processing is unavailable')
                await this.canonicalProcessing.processCanonicalPayment({
                    paymentId: payment.id,
                    merchant: payment.merchant,
                    canonical,
                    source: 'STATUS',
                })
                const updated = await this.paymentRepository.findOneOrFail({ where: { id: payment.id } })
                const subscription = updated.subscriptionId
                    ? await this.subscriptionService.getOne({ where: { id: updated.subscriptionId } })
                    : null
                return {
                    ok: true,
                    paymentId: updated.id,
                    status: updated.status,
                    externalStatus: updated.externalStatus || null,
                    activationStatus: updated.activationStatus || null,
                    subscriptionStatus: subscription?.status || null,
                    autoRenewAvailable: Boolean(updated.paymentMethodId),
                    autoRenewEnabled: Boolean(subscription?.autoRenewEnabled),
                    merchant: updated.merchant,
                }
            } catch (error: any) {
                this.logger.warn(
                    `YooKassa status check failed for payment ${payment.id}: ${error?.message || 'unknown'}`,
                )
                return {
                    ok: false,
                    paymentId: payment.id,
                    status: payment.status,
                    externalStatus: payment.externalStatus || null,
                    activationStatus: payment.activationStatus || PaymentActivationStatus.PENDING,
                    message: 'status_check_failed',
                    merchant: payment.merchant,
                }
            }
        }

        if (payment.status === PaymentStatusEnum.SUCCEEDED) {
            return { ok: true, status: PaymentStatusEnum.SUCCEEDED, message: 'already_succeeded' }
        }

        if (!payment.providerPaymentId) {
            return { ok: true, status: payment.status, message: 'missing_provider_payment_id' }
        }

        try {
            const parsed = await this.plategaProvider.getPaymentStatus(
                payment.providerPaymentId,
                this.paymentProviderRouting.resolvePaymentMerchantProfile(payment),
            )
            parsed.metadata = {
                ...(parsed.metadata || {}),
                local_payment_id: payment.id,
                subscription_id: payment.subscriptionId,
                plan_id: payment.planId,
            }

            const result = await this.processParsedPlategaPayment(parsed)
            return { ok: true, status: result.status || parsed.status, rawStatus: parsed.rawStatus, result }
        } catch (error: any) {
            this.logger.warn(`Platega status check failed for payment ${payment.id}: ${error?.message || 'unknown'}`)
            return { ok: false, status: payment.status, message: 'status_check_failed' }
        }
    }

    private async processParsedPlategaPayment(parsed: ParsedPlategaPayment) {
        const payment = await this.findOrCreatePaymentFromPlatega(parsed)
        const previousStatus = payment.status

        if (previousStatus === PaymentStatusEnum.SUCCEEDED && parsed.status === PaymentStatusEnum.SUCCEEDED) {
            const promoId = String(payment.metadataSnapshot?.promo_id || '').trim()
            if (promoId && payment.userId) {
                await this.paymentSideEffects.finalizePaymentPromo(payment, promoId, payment.paidAt || new Date())
            }
            return { ok: true, status: previousStatus, alreadyProcessed: true }
        }

        if (previousStatus === PaymentStatusEnum.SUCCEEDED && parsed.status === PaymentStatusEnum.CANCELED) {
            return { ok: true, status: previousStatus, ignored: true }
        }

        if (
            previousStatus === PaymentStatusEnum.SUCCEEDED &&
            parsed.status !== PaymentStatusEnum.SUCCEEDED &&
            parsed.status !== PaymentStatusEnum.REFUNDED
        ) {
            return { ok: true, status: previousStatus, ignored: true }
        }

        payment.status = parsed.status
        payment.externalEventId = parsed.providerEventId
        payment.externalStatus = parsed.rawStatus || parsed.status
        payment.provider = PLATEGA_PROVIDER
        payment.providerPaymentId = parsed.providerPaymentId
        payment.paymentPayId = parsed.providerPaymentId
        payment.paymentUrl = parsed.paymentUrl || payment.paymentUrl
        payment.paymentLink = parsed.paymentUrl || payment.paymentLink
        payment.metadataSnapshot = {
            ...(payment.metadataSnapshot || {}),
            ...(parsed.metadata || {}),
            lastProviderRawStatus: parsed.rawStatus,
            lastPaymentStatus: parsed.status,
        }
        this.applyStatusTimestamp(payment, parsed.status)
        if (parsed.status === PaymentStatusEnum.SUCCEEDED && previousStatus !== PaymentStatusEnum.SUCCEEDED) {
            await this.paymentRepository.manager.transaction(async (manager) => {
                await manager.save(payment)
                await enqueuePaymentAdminNotification(manager, payment.id, payment.paidAt || new Date())
            })
        } else {
            await this.paymentRepository.save(payment)
        }

        if (parsed.status !== PaymentStatusEnum.SUCCEEDED) {
            const promoId = payment.metadataSnapshot?.promo_id || parsed.metadata?.promo_id || parsed.metadata?.promoId
            if (promoId && payment.userId) {
                await this.paymentSideEffects.cancelPaymentPromo(
                    payment,
                    String(promoId),
                    payment.canceledAt || new Date(),
                )
            }
            return { ok: true, status: parsed.status }
        }

        if (!payment.subscriptionId || !payment.planId) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Missing subscription or plan for successful payment')
        }
        const promoId = String(payment.metadataSnapshot?.promo_id || '').trim()
        if (promoId && payment.userId) {
            await this.paymentSideEffects.finalizePaymentPromo(payment, promoId, payment.paidAt || new Date())
        }

        await this.orchestrator.activatePaidSubscription({
            subscriptionId: payment.subscriptionId,
            planId: payment.planId,
            paymentId: payment.id,
            paidAmountRub: payment.amount,
            paymentExternalId: parsed.providerPaymentId,
            promoTerms: {
                durationDays: Number(payment.metadataSnapshot?.promo_duration_days) || undefined,
                devicesLimit: Number(payment.metadataSnapshot?.promo_devices_limit) || undefined,
            },
            operationKey: this.buildWebhookIdempotencyKey(parsed),
            paidAt: payment.paidAt || new Date(),
        })

        await this.paymentSideEffects.notifyPaymentSucceeded(payment)
        return { ok: true, status: parsed.status }
    }

    private async findOrCreatePaymentFromPlatega(parsed: ParsedPlategaPayment) {
        const localPaymentId = parsed.metadata?.local_payment_id || parsed.metadata?.localPaymentId
        const byLocalId = localPaymentId
            ? await this.paymentRepository.findOne({
                  where: { id: String(localPaymentId) },
                  relations: { user: true, subscription: true },
              })
            : null
        if (byLocalId) {
            return byLocalId
        }

        const existing = await this.paymentRepository.findOne({
            where: [
                { provider: PLATEGA_PROVIDER, providerPaymentId: parsed.providerPaymentId },
                { paymentPayId: parsed.providerPaymentId },
            ],
            relations: { user: true, subscription: true },
        })
        if (existing) {
            return existing
        }

        const subscriptionId = parsed.metadata?.subscription_id || parsed.metadata?.subscriptionId
        const planId = parsed.metadata?.plan_id || parsed.metadata?.planId
        if (!subscriptionId || !planId) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Missing subscription_id or plan_id in payment metadata')
        }

        const subscription = await this.subscriptionService.getOne({
            where: { id: subscriptionId },
            relations: { user: true },
        })

        return this.paymentRepository.save({
            amount: parsed.amount || 0,
            currency: parsed.currency || 'RUB',
            status: PaymentStatusEnum.PENDING,
            provider: PLATEGA_PROVIDER,
            providerPaymentId: parsed.providerPaymentId,
            paymentPayId: parsed.providerPaymentId,
            paymentUrl: parsed.paymentUrl || '',
            paymentLink: parsed.paymentUrl || '',
            subscription: { id: subscriptionId } as any,
            subscriptionId,
            user: subscription?.user as any,
            userId: subscription?.userId,
            plan: { id: planId } as any,
            planId,
            idempotencyKey: `webhook-created:${PLATEGA_PROVIDER}:${parsed.providerPaymentId}`,
            metadataSnapshot: {
                ...(parsed.metadata || {}),
                payment_profile: parsed.metadata?.payment_profile || parsed.metadata?.paymentProfile || 'bot',
            },
        } as any)
    }

    private async findOrCreateWebhookEvent(
        parsed: ParsedPlategaPayment,
        rawBody: any,
        headers: Record<string, any>,
        signatureValid: boolean,
        idempotencyKey: string,
    ) {
        const existing = await this.webhookEventRepository.findOne({
            where: { provider: parsed.provider, idempotencyKey },
        })
        if (existing) {
            return existing
        }

        return this.webhookEventRepository.save({
            provider: parsed.provider,
            providerEventId: parsed.providerEventId,
            providerPaymentId: parsed.providerPaymentId,
            eventType: parsed.eventType,
            status: parsed.status,
            rawBody: this.safeWebhookBody(rawBody),
            headers: this.safeWebhookHeaders(headers),
            signatureValid,
            processed: false,
            receivedAt: new Date(),
            idempotencyKey,
        })
    }

    private buildWebhookIdempotencyKey(parsed: ParsedPlategaPayment) {
        return `${parsed.provider}:${parsed.providerEventId || parsed.providerPaymentId}:${parsed.status}`
    }

    private applyStatusTimestamp(payment: Payment, status: PaymentStatusEnum) {
        const now = new Date()
        if (status === PaymentStatusEnum.SUCCEEDED) {
            payment.paidAt = payment.paidAt || now
        } else if (status === PaymentStatusEnum.FAILED) {
            payment.failedAt = payment.failedAt || now
        } else if (status === PaymentStatusEnum.CANCELED) {
            payment.canceledAt = payment.canceledAt || now
        } else if (status === PaymentStatusEnum.EXPIRED) {
            payment.expiredAt = payment.expiredAt || now
        }
    }

    private safeWebhookBody(rawBody: any) {
        if (!rawBody || typeof rawBody !== 'object' || Buffer.isBuffer(rawBody)) {
            return {}
        }

        return rawBody
    }

    private safeWebhookHeaders(headers: Record<string, any>) {
        return {
            'content-type': headers?.['content-type'],
            'user-agent': headers?.['user-agent'],
            'x-request-id': headers?.['x-request-id'],
            'x-merchantid': headers?.['x-merchantid'] ? this.maskTail(headers['x-merchantid']) : undefined,
            'x-secret': headers?.['x-secret'] ? '[present]' : undefined,
        }
    }

    private maskTail(value: any) {
        const raw = String(value || '')
        return raw.length <= 4 ? '[present]' : `***${raw.slice(-4)}`
    }
}
