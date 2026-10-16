import { createHash, randomUUID } from 'crypto'

import { BadRequestException, Inject, Injectable, ServiceUnavailableException, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'

import { enqueuePaymentAdminNotification } from './payment-admin-notification.outbox'
import { PaymentPromoLifecycleService } from '../../promo/services/payment-promo-lifecycle.service'
import { calculateNetReferralReward } from '../../referral/utils/referral-reward-calculator'
import { SubscriptionRenewal } from '../../subscription/entity/subscription-renewal.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { SubscriptionAutoRenewStatus } from '../../subscription/enum/subscription-auto-renew-status.enum'
import { SubscriptionRenewalStatus } from '../../subscription/enum/subscription-renewal-status.enum'
import { SubscriptionAutoRenewService } from '../../subscription/services/subscription-auto-renew.service'
import { SubscriptionLifecycleOrchestrator } from '../../subscription/services/subscription-lifecycle.orchestrator'
import { YooKassaWebhookDto } from '../dto/yookassa-webhook.dto'
import { PaymentAttempt } from '../entity/payment-attempt.entity'
import { PaymentMethod } from '../entity/payment-method.entity'
import { PaymentWebhookEvent } from '../entity/payment-webhook-event.entity'
import { Payment } from '../entity/payment.entity'
import { PaymentActivationStatus } from '../enum/payment-activation-status.enum'
import { PaymentAttemptStatus } from '../enum/payment-attempt-status.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentMethodStatus } from '../enum/payment-method-status.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { CreatedExternalPayment } from '../providers/payment-provider.contract'
import { YooKassaPaymentProvider } from '../providers/yookassa-payment.provider'
import { PaymentMethodConsentSource } from '../types/payment-method-consent-source'

@Injectable()
export class PaymentCanonicalProcessingService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly config: ConfigService,
        private readonly provider: YooKassaPaymentProvider,
        @Inject(forwardRef(() => SubscriptionLifecycleOrchestrator))
        private readonly orchestrator: SubscriptionLifecycleOrchestrator,
        private readonly paymentPromoLifecycle: PaymentPromoLifecycleService,
        @InjectRepository(Payment) private readonly payments: Repository<Payment>,
        @InjectRepository(PaymentWebhookEvent) private readonly events: Repository<PaymentWebhookEvent>,
        @Inject(forwardRef(() => SubscriptionAutoRenewService))
        private readonly autoRenew: SubscriptionAutoRenewService,
    ) {}

    async handleWebhook(merchant: PaymentMerchant, dto: YooKassaWebhookDto, headers: Record<string, unknown>) {
        if (this.config.get<string>('PAYMENT_YOOKASSA_WEBHOOK_ENABLED') !== 'true') {
            throw new ServiceUnavailableException('YooKassa webhook processing is disabled')
        }
        if (this.config.get<string>('YOOKASSA_WEBHOOK_IP_CHECK_ENABLED') === 'true') {
            throw new ServiceUnavailableException('Trusted proxy client IP extraction is not configured')
        }
        const key = createHash('sha256')
            .update(`yookassa:${merchant}:${dto.event}:${dto.object.id}:${dto.object.status}`)
            .digest('hex')
        let event = await this.events.findOne({ where: { provider: 'yookassa', idempotencyKey: key } })
        if (event?.processed) return { ok: true }
        if (!event) {
            event = this.events.create({
                provider: 'yookassa',
                merchant,
                providerEventId: null,
                providerPaymentId: dto.object.id,
                eventType: dto.event,
                status: dto.object.status,
                signatureValid: true,
                processed: false,
                idempotencyKey: key,
                rawBody: { type: dto.type, event: dto.event, object: { id: dto.object.id, status: dto.object.status } },
                headers: this.safeHeaders(headers),
                receivedAt: new Date(),
            })
            try {
                event = await this.events.save(event)
            } catch {
                event = await this.events.findOneOrFail({ where: { provider: 'yookassa', idempotencyKey: key } })
                if (event.processed) return { ok: true }
            }
        }
        try {
            const payment = await this.payments.findOne({
                where: { provider: 'yookassa', merchant, providerPaymentId: dto.object.id },
            })
            if (!payment) throw new BadRequestException('Canonical payment does not match a local payment')
            const canonical = await this.provider.getPayment({ providerPaymentId: dto.object.id, merchant })
            await this.processCanonicalPayment({ paymentId: payment.id, merchant, canonical, source: 'WEBHOOK' })
            event.processed = true
            event.processedAt = new Date()
            event.processingError = null
            await this.events.save(event)
            return { ok: true }
        } catch (error: any) {
            event.processingError = this.safeError(error)
            await this.events.save(event)
            throw error
        }
    }

    async processCanonicalPayment(input: {
        paymentId: string
        merchant: PaymentMerchant
        canonical: CreatedExternalPayment
        source: 'WEBHOOK' | 'STATUS' | 'RECONCILIATION' | 'RECURRENT_CREATE'
    }) {
        const result = await this.dataSource.transaction(async (manager) => {
            const payment = await manager
                .getRepository(Payment)
                .createQueryBuilder('payment')
                .setLock('pessimistic_write')
                .where('payment.id = :id', { id: input.paymentId })
                .getOneOrFail()
            this.validateCanonical(payment, input.merchant, input.canonical)
            const alreadyProcessed = Boolean(payment.processedAt)
            if (input.canonical.status === PaymentStatusEnum.SUCCEEDED) {
                payment.status = PaymentStatusEnum.SUCCEEDED
                payment.externalStatus = input.canonical.externalStatus
                payment.paidAt = this.safeDate(input.canonical.capturedAt || input.canonical.createdAt) || new Date()
                payment.metadataSnapshot = {
                    ...(payment.metadataSnapshot || {}),
                    canonical: input.canonical.safeResponseSnapshot,
                    canonicalSource: input.source,
                }
                if (!alreadyProcessed) {
                    await this.applyLocalPaidState(manager, payment)
                    await manager.save(payment)
                    const promoCodeId = this.getPromoCodeId(payment)
                    if (promoCodeId && payment.userId) {
                        await this.paymentPromoLifecycle.finalizeSuccessfulPayment(manager, {
                            paymentId: payment.id,
                            userId: payment.userId,
                            promoCodeId,
                            subscriptionId: payment.subscriptionId,
                            appliedAt: payment.paidAt,
                        })
                    }
                    payment.processedAt = new Date()
                    payment.activationStatus = PaymentActivationStatus.PENDING
                    await enqueuePaymentAdminNotification(manager, payment.id, payment.processedAt)
                }
                if (payment.userId && this.shouldPersistPaymentMethod(payment, input.canonical)) {
                    const method = await this.saveMethod(manager, payment.userId, input.merchant, input.canonical)
                    payment.paymentMethodId = method.id
                    await this.autoRenew.enableFromProviderSavedMethod(manager, {
                        subscriptionId: payment.subscriptionId!,
                        userId: payment.userId,
                        merchant: input.merchant,
                        paymentMethodId: method.id,
                        enabledAt: payment.paidAt || new Date(),
                    })
                }
                if (payment.isRecurring) {
                    await this.applyRecurrentSuccess(manager, payment)
                    await this.finishRecurrentAttempt(manager, payment, PaymentAttemptStatus.SUCCEEDED)
                }
            } else if (
                input.canonical.status === PaymentStatusEnum.CANCELED &&
                payment.status !== PaymentStatusEnum.SUCCEEDED
            ) {
                payment.status = PaymentStatusEnum.CANCELED
                payment.externalStatus = input.canonical.externalStatus
                payment.canceledAt = new Date()
                await manager.save(payment)
                const promoCodeId = this.getPromoCodeId(payment)
                if (promoCodeId && payment.userId) {
                    await this.paymentPromoLifecycle.cancelFailedPayment(manager, {
                        paymentId: payment.id,
                        userId: payment.userId,
                        promoCodeId,
                        canceledAt: payment.canceledAt,
                    })
                }
                if (payment.isRecurring) {
                    await this.applyRecurrentCancellation(manager, payment, input.canonical)
                    await this.finishRecurrentAttempt(
                        manager,
                        payment,
                        PaymentAttemptStatus.CANCELED,
                        input.canonical.cancellationReason,
                    )
                }
            } else if (![PaymentStatusEnum.SUCCEEDED, PaymentStatusEnum.CANCELED].includes(payment.status)) {
                payment.status = PaymentStatusEnum.PENDING
                payment.externalStatus = input.canonical.externalStatus
                if (payment.isRecurring) {
                    await manager
                        .getRepository(PaymentAttempt)
                        .update({ paymentId: payment.id }, { status: PaymentAttemptStatus.PENDING, retryable: true })
                }
            }
            await manager.save(payment)
            return {
                payment,
                shouldReconcile:
                    payment.status === PaymentStatusEnum.SUCCEEDED &&
                    payment.activationStatus !== PaymentActivationStatus.SUCCEEDED,
            }
        })
        if (result.shouldReconcile) await this.reconcileActivation(result.payment.id)
        const refreshed = await this.payments.findOneOrFail({ where: { id: result.payment.id } })
        return {
            paymentStatus: refreshed.status,
            activationStatus: refreshed.activationStatus || null,
            paymentMethodSaved: Boolean(refreshed.paymentMethodId),
        }
    }

    async processConfirmedPlategaRecurrentCharge(paymentId: string, paidThroughAt: Date) {
        const trustedPaidThroughAt = this.requireTrustedRecurrentPaidThroughAt(paidThroughAt)
        const result = await this.dataSource.transaction(async (manager) => {
            const payment = await manager
                .getRepository(Payment)
                .createQueryBuilder('payment')
                .setLock('pessimistic_write')
                .where('payment.id = :id', { id: paymentId })
                .getOneOrFail()
            if (payment.provider !== 'platega' || !payment.isRecurring || !payment.merchant) {
                throw new BadRequestException('Payment is not a Platega recurrent charge')
            }
            if (!payment.processedAt) {
                payment.status = PaymentStatusEnum.SUCCEEDED
                payment.externalStatus = 'CONFIRMED'
                payment.paidAt ||= new Date()
                payment.metadataSnapshot = {
                    ...(payment.metadataSnapshot || {}),
                    canonicalSource: 'PLATEGA_RECURRENT_CALLBACK',
                    platega_recurrent_paid_through_at: trustedPaidThroughAt.toISOString(),
                }
                await this.applyLocalPaidState(manager, payment, { paidThroughAt: trustedPaidThroughAt })
                payment.processedAt = new Date()
                payment.activationStatus = PaymentActivationStatus.PENDING
                await enqueuePaymentAdminNotification(manager, payment.id, payment.processedAt)
                await manager.save(payment)
            } else {
                const storedPaidThroughValue = payment.metadataSnapshot?.platega_recurrent_paid_through_at
                const storedPaidThroughAt = storedPaidThroughValue ? new Date(storedPaidThroughValue) : null
                if (
                    !storedPaidThroughAt ||
                    Number.isNaN(storedPaidThroughAt.getTime()) ||
                    storedPaidThroughAt.getTime() !== trustedPaidThroughAt.getTime()
                ) {
                    throw new BadRequestException('Processed recurrent charge paid-through boundary mismatch')
                }
            }
            return {
                id: payment.id,
                shouldReconcile: payment.activationStatus !== PaymentActivationStatus.SUCCEEDED,
            }
        })
        if (result.shouldReconcile) await this.reconcileActivation(result.id)
        return { ok: true }
    }

    private shouldPersistPaymentMethod(payment: Payment, canonical: CreatedExternalPayment): boolean {
        return (
            this.config.get<string>('PAYMENT_RECURRENT_ENABLED') === 'true' &&
            String(payment.provider).toUpperCase() === PaymentProvider.YOOKASSA &&
            payment.metadataSnapshot?.payment_method_consent_source ===
                PaymentMethodConsentSource.YOOKASSA_CONDITIONAL &&
            canonical.status === PaymentStatusEnum.SUCCEEDED &&
            canonical.merchant === payment.merchant &&
            canonical.paymentMethod?.saved === true &&
            Boolean(canonical.paymentMethod.id)
        )
    }

    private getPromoCodeId(payment: Payment): string | null {
        const promoCodeId = String(payment.metadataSnapshot?.promo_id || '').trim()
        return promoCodeId || null
    }

    private async finishRecurrentAttempt(
        manager: EntityManager,
        payment: Payment,
        status: PaymentAttemptStatus,
        errorCode?: string | null,
    ) {
        await manager.getRepository(PaymentAttempt).update(
            { paymentId: payment.id },
            {
                status,
                retryable: false,
                finishedAt: new Date(),
                errorCode: errorCode ? String(errorCode).slice(0, 64) : null,
                errorMessage: errorCode ? 'Canonical recurrent payment was canceled' : null,
            },
        )
    }

    async reconcileActivation(paymentId: string): Promise<void> {
        const token = randomUUID()
        const claim = await this.payments
            .createQueryBuilder()
            .update(Payment)
            .set({
                activationStatus: PaymentActivationStatus.PROCESSING,
                activationLeaseToken: token,
                activationLeaseExpiresAt: new Date(Date.now() + 5 * 60_000),
                activationAttemptCount: () => '"activation_attempt_count" + 1',
            })
            .where('id = :id', { id: paymentId })
            .andWhere('activation_status IN (:...states)', {
                states: [
                    PaymentActivationStatus.PENDING,
                    PaymentActivationStatus.FAILED_RETRYABLE,
                    PaymentActivationStatus.PROCESSING,
                ],
            })
            .andWhere('(activation_lease_expires_at IS NULL OR activation_lease_expires_at < now())')
            .andWhere('activation_attempt_count < 20')
            .execute()
        if (claim.affected !== 1) return
        const payment = await this.payments.findOneOrFail({ where: { id: paymentId } })
        try {
            const canonicalSnapshot = payment.metadataSnapshot?.canonical as Record<string, any> | undefined
            const incomeAmount = canonicalSnapshot?.incomeAmount
            const rewardCalculation = calculateNetReferralReward({
                grossAmountRub: String(payment.amount),
                providerIncomeAmountRub:
                    incomeAmount?.currency === 'RUB' && incomeAmount?.value !== null
                        ? String(incomeAmount.value)
                        : null,
                paymentMethodType:
                    typeof canonicalSnapshot?.paymentMethod?.type === 'string'
                        ? canonicalSnapshot.paymentMethod.type
                        : null,
            })
            await this.orchestrator.activatePaidSubscription({
                subscriptionId: payment.subscriptionId,
                planId: payment.planId,
                paymentId: payment.id,
                paymentExternalId: payment.providerPaymentId,
                paidAmountRub: Number(payment.amount),
                operationKey: `payment:${payment.id}:paid-activation`,
                paidAt: payment.paidAt,
                localStateAlreadyApplied: true,
                referralRewardCalculation: rewardCalculation,
            })
            await this.finishActivation(payment.id, token, PaymentActivationStatus.SUCCEEDED)
        } catch (error: any) {
            await this.finishActivation(
                payment.id,
                token,
                payment.activationAttemptCount >= 20
                    ? PaymentActivationStatus.FAILED_TERMINAL
                    : PaymentActivationStatus.FAILED_RETRYABLE,
                this.safeError(error),
            )
        }
    }

    private async finishActivation(id: string, token: string, status: PaymentActivationStatus, error?: string) {
        await this.payments
            .createQueryBuilder()
            .update(Payment)
            .set({
                activationStatus: status,
                activationLeaseToken: null,
                activationLeaseExpiresAt: null,
                activationErrorCode: error ? 'REMNAWAVE_RECONCILIATION' : null,
                activationErrorMessage: error || null,
            })
            .where('id = :id', { id })
            .andWhere('activation_status = :processing', { processing: PaymentActivationStatus.PROCESSING })
            .andWhere('activation_lease_token = :token', { token })
            .execute()
    }

    private validateCanonical(payment: Payment, merchant: PaymentMerchant, canonical: CreatedExternalPayment) {
        if (payment.provider !== 'yookassa' || payment.merchant !== merchant)
            throw new BadRequestException('Merchant mismatch')
        if (!payment.providerPaymentId || payment.providerPaymentId !== canonical.providerPaymentId) {
            throw new BadRequestException('Provider payment mismatch')
        }
        if (canonical.merchant !== merchant) throw new BadRequestException('Canonical merchant mismatch')
        if (
            canonical.currency !== 'RUB' ||
            Number(canonical.amountValue).toFixed(2) !== Number(payment.amount).toFixed(2)
        )
            throw new BadRequestException('Canonical amount mismatch')
        if (canonical.metadata?.local_payment_id !== payment.id)
            throw new BadRequestException('Canonical metadata mismatch')
        if (payment.subscriptionId && canonical.metadata?.subscription_id !== payment.subscriptionId) {
            throw new BadRequestException('Subscription mismatch')
        }
        if (payment.planId && canonical.metadata?.plan_id !== payment.planId)
            throw new BadRequestException('Plan mismatch')
        if (canonical.metadata?.merchant !== merchant) throw new BadRequestException('Metadata merchant mismatch')
    }

    private async applyLocalPaidState(manager: EntityManager, payment: Payment, options?: { paidThroughAt?: Date }) {
        const subscription = (await manager
            .getRepository('subscriptions')
            .createQueryBuilder('subscription')
            .setLock('pessimistic_write')
            .where('subscription.id = :id', { id: payment.subscriptionId })
            .getOne()) as any
        if (!subscription) throw new BadRequestException('Subscription not found')
        const plan = (await manager.getRepository('plans').findOneByOrFail({ id: payment.planId })) as any
        const paidAt = payment.paidAt || new Date()
        const trustedPlategaRecurrent = payment.provider === 'platega' && payment.isRecurring
        const periodStart = payment.isRecurring && subscription.endsAt ? new Date(subscription.endsAt) : paidAt
        const endsAt = trustedPlategaRecurrent
            ? this.requireTrustedRecurrentPaidThroughAt(options?.paidThroughAt, subscription.endsAt)
            : new Date(periodStart)
        if (!trustedPlategaRecurrent) {
            endsAt.setDate(
                endsAt.getDate() +
                    Number(
                        payment.metadataSnapshot?.recurrent_duration_days ||
                            payment.metadataSnapshot?.promo_duration_days ||
                            plan.period,
                    ),
            )
        }
        Object.assign(subscription, {
            planId: plan.id,
            status: StatusesEnum.ACTIVE,
            startAt: payment.isRecurring ? subscription.startAt : paidAt,
            endsAt,
            nextPayAt: endsAt,
            graceEndsAt: null,
            accessDisabledAt: null,
            isTrial: false,
            trialEndsAt: null,
            reminderState: {},
        })
        if (payment.provider === 'yookassa') subscription.yookassaPaymentId = payment.providerPaymentId || ''
        await manager.save('subscriptions', subscription)
    }

    private requireTrustedRecurrentPaidThroughAt(value?: Date, currentPaidThroughAt?: Date | null) {
        if (!(value instanceof Date) || Number.isNaN(value.getTime()) || value <= new Date()) {
            throw new BadRequestException('A trusted future recurrent paid-through boundary is required')
        }
        const currentPaidThrough = currentPaidThroughAt ? new Date(currentPaidThroughAt) : null
        if (
            currentPaidThrough &&
            !Number.isNaN(currentPaidThrough.getTime()) &&
            value <= currentPaidThrough
        ) {
            throw new BadRequestException('Recurrent paid-through boundary must strictly advance existing access')
        }
        return new Date(value.getTime())
    }

    private async applyRecurrentSuccess(manager: EntityManager, payment: Payment) {
        const renewal = await manager.getRepository(SubscriptionRenewal).findOne({
            where: { subscriptionId: payment.subscriptionId, billingPeriodKey: payment.billingPeriodKey },
        })
        const subscription = await manager.getRepository(Subscription).findOneByOrFail({ id: payment.subscriptionId })
        if (renewal) {
            renewal.status = SubscriptionRenewalStatus.SUCCEEDED
            renewal.succeededPaymentId = payment.id
            renewal.nextAttemptAt = null
            renewal.failureCode = null
            renewal.failureMessage = null
            await manager.save(renewal)
        }
        subscription.lastPaymentAt = payment.paidAt || new Date()
        subscription.nextPaymentAt = subscription.endsAt || null
        subscription.autoRenewFailureCount = 0
        if (subscription.autoRenewEnabled) subscription.autoRenewStatus = SubscriptionAutoRenewStatus.ACTIVE
        await manager.save(subscription)
    }

    private async applyRecurrentCancellation(
        manager: EntityManager,
        payment: Payment,
        canonical: CreatedExternalPayment,
    ) {
        const renewal = await manager.getRepository(SubscriptionRenewal).findOne({
            where: { subscriptionId: payment.subscriptionId, billingPeriodKey: payment.billingPeriodKey },
        })
        const subscription = await manager.getRepository(Subscription).findOneByOrFail({ id: payment.subscriptionId })
        const reason = String(canonical.cancellationReason || 'unknown')
        const revokeReasons = ['permission_revoked', 'payment_method_restricted', 'card_expired', 'invalid_card_number']
        const retryReasons = [
            'insufficient_funds',
            'issuer_unavailable',
            'internal_timeout',
            'payment_method_limit_exceeded',
            'general_decline',
            'unknown',
        ]
        if (revokeReasons.includes(reason)) {
            if (payment.paymentMethodId) {
                await manager.getRepository(PaymentMethod).update(payment.paymentMethodId, {
                    status: PaymentMethodStatus.REVOKED,
                    revokedAt: new Date(),
                })
            }
            subscription.autoRenewEnabled = false
            subscription.autoRenewStatus = SubscriptionAutoRenewStatus.MANUAL_ACTION_REQUIRED
            subscription.nextPaymentAt = null
        } else if (retryReasons.includes(reason) && (renewal?.attemptCount || 0) < 3) {
            const delayHours = (renewal?.attemptCount || 1) === 1 ? 6 : 24
            const retryAt = new Date(Date.now() + delayHours * 60 * 60_000)
            subscription.autoRenewStatus = SubscriptionAutoRenewStatus.RETRY_SCHEDULED
            subscription.autoRenewFailureCount = (subscription.autoRenewFailureCount || 0) + 1
            subscription.nextPaymentAt = retryAt
            if (renewal) renewal.nextAttemptAt = retryAt
        } else {
            subscription.autoRenewStatus = SubscriptionAutoRenewStatus.MANUAL_ACTION_REQUIRED
            subscription.nextPaymentAt = null
        }
        if (renewal) {
            renewal.status =
                subscription.autoRenewStatus === SubscriptionAutoRenewStatus.MANUAL_ACTION_REQUIRED
                    ? SubscriptionRenewalStatus.MANUAL_ACTION_REQUIRED
                    : SubscriptionRenewalStatus.FAILED
            renewal.failureCode = reason
            renewal.failureMessage = 'Canonical recurrent payment was canceled'
            await manager.save(renewal)
        }
        await manager.save(subscription)
    }

    private async saveMethod(
        manager: EntityManager,
        userId: string,
        merchant: PaymentMerchant,
        canonical: CreatedExternalPayment,
    ) {
        const providerMethodId = canonical.paymentMethod.id
        let method = await manager
            .getRepository(PaymentMethod)
            .createQueryBuilder('method')
            .addSelect('method.providerMethodId')
            .where('method.provider = :provider', { provider: PaymentProvider.YOOKASSA })
            .andWhere('method.merchant = :merchant', { merchant })
            .andWhere('method.providerMethodId = :providerMethodId', { providerMethodId })
            .getOne()
        if (method && method.userId !== userId) throw new BadRequestException('Payment method ownership conflict')
        method =
            method ||
            manager.create(PaymentMethod, {
                userId,
                provider: PaymentProvider.YOOKASSA,
                merchant,
                providerMethodId,
            })
        Object.assign(method, {
            status: PaymentMethodStatus.ACTIVE,
            revokedAt: null,
            lastUsedAt: new Date(),
            methodType: canonical.paymentMethod.type,
            displayTitle: canonical.paymentMethod.title,
            last4: /^\d{4}$/.test(canonical.paymentMethod.last4 || '') ? canonical.paymentMethod.last4 : null,
        })
        return manager.save(method)
    }

    private safeHeaders(headers: Record<string, unknown>) {
        return ['user-agent', 'content-type'].reduce(
            (result, key) => {
                if (headers?.[key]) result[key] = String(headers[key]).slice(0, 256)
                return result
            },
            {} as Record<string, string>,
        )
    }

    private safeError(error: any) {
        return String(error?.message || 'Processing failed')
            .replace(/[\r\n]/g, ' ')
            .slice(0, 500)
    }

    private safeDate(value?: string | null) {
        const date = value ? new Date(value) : null
        return date && Number.isFinite(date.getTime()) ? date : null
    }
}
