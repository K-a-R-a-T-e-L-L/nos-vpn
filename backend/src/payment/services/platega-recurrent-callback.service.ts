import { createHash } from 'crypto'

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { PaymentCanonicalProcessingService } from './payment-canonical-processing.service'
import { PlategaChargeCallbackDto, PlategaSubscriptionStatusCallbackDto } from '../dto/platega-recurrent.dto'
import { PaymentWebhookEvent } from '../entity/payment-webhook-event.entity'
import { Payment } from '../entity/payment.entity'
import { PlategaRecurrentAgreement } from '../entity/platega-recurrent-agreement.entity'
import { PaymentActivationStatus } from '../enum/payment-activation-status.enum'
import { PaymentKind } from '../enum/payment-kind.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PlategaRecurrentAgreementStatus } from '../enum/platega-recurrent-agreement-status.enum'
import { PlategaRecurrentProvider } from '../providers/platega-recurrent.provider'

@Injectable()
export class PlategaRecurrentCallbackService {
    constructor(
        private readonly provider: PlategaRecurrentProvider,
        @InjectRepository(PlategaRecurrentAgreement)
        private readonly agreements: Repository<PlategaRecurrentAgreement>,
        @InjectRepository(Payment) private readonly payments: Repository<Payment>,
        @InjectRepository(PaymentWebhookEvent) private readonly events: Repository<PaymentWebhookEvent>,
        private readonly canonical: PaymentCanonicalProcessingService,
    ) {}

    async handleSubscriptionStatus(dto: PlategaSubscriptionStatusCallbackDto, headers: Record<string, any>) {
        const merchant = this.merchantFor(this.provider.verifyCallback(headers))
        if (dto.Id !== dto.SubscriptionId) throw new BadRequestException('Subscription callback identifiers mismatch')
        const event = await this.getOrCreateEvent('subscription-status', merchant, dto.Id, dto.Status, dto)
        if (event.processed) return { ok: true }
        try {
            const agreement = await this.findAgreement(dto.SubscriptionId, merchant)
            if (Number(dto.PaymentMethod) !== 6) throw new BadRequestException('Unsupported recurrent payment method')
            if (Number(dto.Amount) !== Number(agreement.amount))
                throw new BadRequestException('Subscription amount mismatch')
            if (String(dto.Currency).toUpperCase() !== agreement.currency) {
                throw new BadRequestException('Subscription currency mismatch')
            }
            const incoming = this.mapMandateStatus(dto.Status)
            agreement.rawProviderStatus = String(dto.Status).slice(0, 64)
            if (incoming) {
                if (
                    incoming === PlategaRecurrentAgreementStatus.CANCELLED ||
                    !this.isTerminal(agreement.normalizedStatus)
                ) {
                    if (
                        agreement.normalizedStatus === PlategaRecurrentAgreementStatus.PAST_DUE &&
                        incoming === PlategaRecurrentAgreementStatus.ACTIVE
                    ) {
                        const canonical = await this.provider.getSubscription(
                            agreement.providerSubscriptionId!,
                            merchant === PaymentMerchant.SITE ? 'web' : 'bot',
                        )
                        this.validateProviderSnapshot(agreement, canonical)
                        agreement.rawProviderStatus = canonical.status.slice(0, 64)
                        agreement.normalizedStatus =
                            this.mapMandateStatus(canonical.status) || agreement.normalizedStatus
                        const nextChargeAt = this.safeDate(canonical.nextChargeAt)
                        if (nextChargeAt) agreement.nextChargeAt = nextChargeAt
                    } else {
                        agreement.normalizedStatus = incoming
                        const nextChargeAt = this.safeDate(dto.NextChargeAt)
                        if (nextChargeAt) agreement.nextChargeAt = nextChargeAt
                    }
                }
                if (incoming === PlategaRecurrentAgreementStatus.CANCELLED) {
                    agreement.providerCancelledAt ||= new Date()
                    agreement.cancelledAt ||= new Date()
                }
            }
            await this.agreements.save(agreement)
            await this.completeEvent(event)
            return { ok: true }
        } catch (error: any) {
            await this.failEvent(event, error)
            throw error
        }
    }

    async handleCharge(dto: PlategaChargeCallbackDto, headers: Record<string, any>) {
        const merchant = this.merchantFor(this.provider.verifyCallback(headers))
        if (Number(dto.PaymentMethod) !== 6) throw new BadRequestException('Unsupported recurrent payment method')
        const event = await this.getOrCreateEvent('charge-status', merchant, dto.Id, dto.Status, dto)
        if (event.processed) return { ok: true }
        try {
            const agreement = await this.findAgreement(dto.SubscriptionId, merchant)
            this.validateCharge(dto, agreement)
            const status = String(dto.Status).toUpperCase()
            const paidThroughAt = status === 'CONFIRMED' ? this.requireFuturePaidThroughAt(dto.NextChargeAt) : null
            let payment = await this.payments.findOne({
                where: { provider: 'platega', merchant, providerPaymentId: dto.Id, isRecurring: true },
            })
            if (!payment) {
                payment = this.payments.create({
                    amount: agreement.amount,
                    currency: agreement.currency,
                    userId: agreement.userId,
                    subscriptionId: agreement.subscriptionId,
                    planId: agreement.planId,
                    provider: 'platega',
                    kind: PaymentKind.EXTERNAL,
                    merchant,
                    providerPaymentId: dto.Id,
                    idempotencyKey: this.hash(`platega-recurrent-charge:${merchant}:${dto.Id}`),
                    externalEventId: null,
                    externalStatus: String(dto.Status).slice(0, 64),
                    status: PaymentStatusEnum.PENDING,
                    isRecurring: true,
                    billingPeriodKey: String(dto.Id).slice(0, 64),
                    activationStatus: null,
                    metadataSnapshot: {
                        platega_recurrent_agreement_id: agreement.id,
                        provider_subscription_id: agreement.providerSubscriptionId,
                        recurrent_duration_days: agreement.durationDays,
                        frozen_plan: agreement.planSnapshot,
                        ...(paidThroughAt ? { platega_recurrent_paid_through_at: paidThroughAt.toISOString() } : {}),
                    },
                })
                try {
                    payment = await this.payments.save(payment)
                } catch {
                    payment = await this.payments.findOne({
                        where: { provider: 'platega', merchant, providerPaymentId: dto.Id, isRecurring: true },
                    })
                    if (!payment) throw new BadRequestException('Unable to record recurrent charge')
                }
            }

            if (status === 'CONFIRMED') {
                await this.canonical.processConfirmedPlategaRecurrentCharge(payment.id, paidThroughAt!)
                // Persist the mandate schedule only after the paid entitlement is canonical.
                agreement.nextChargeAt = paidThroughAt!
                agreement.lastChargeAt = new Date()
            } else if (status === 'CHARGEBACKED') {
                payment.externalStatus = status
                payment.status = PaymentStatusEnum.REFUNDED
                await this.payments.save(payment)
            } else if (payment.status !== PaymentStatusEnum.SUCCEEDED) {
                payment.externalStatus = status.slice(0, 64)
                if (status === 'CANCELED') {
                    payment.status = PaymentStatusEnum.CANCELED
                    payment.canceledAt ||= new Date()
                } else if (status === 'FAILED') {
                    payment.status = PaymentStatusEnum.FAILED
                    payment.failedAt ||= new Date()
                }
                await this.payments.save(payment)
            }
            const reportedNextChargeAt = this.safeDate(dto.NextChargeAt)
            if (reportedNextChargeAt) agreement.nextChargeAt = reportedNextChargeAt
            await this.agreements.save(agreement)
            await this.completeEvent(event)
            return { ok: true }
        } catch (error: any) {
            await this.failEvent(event, error)
            throw error
        }
    }

    private async findAgreement(providerSubscriptionId: string, merchant: PaymentMerchant) {
        const agreement = await this.agreements.findOne({ where: { providerSubscriptionId, merchant } })
        if (!agreement) throw new BadRequestException('Unknown Platega recurrent subscription')
        return agreement
    }

    private validateCharge(dto: PlategaChargeCallbackDto, agreement: PlategaRecurrentAgreement) {
        if (dto.SubscriptionId !== agreement.providerSubscriptionId)
            throw new BadRequestException('Subscription mismatch')
        if (Number(dto.Amount) !== Number(agreement.amount)) throw new BadRequestException('Charge amount mismatch')
        if (String(dto.Currency).toUpperCase() !== agreement.currency)
            throw new BadRequestException('Charge currency mismatch')
    }

    private validateProviderSnapshot(agreement: PlategaRecurrentAgreement, snapshot: any) {
        if (snapshot.providerSubscriptionId !== agreement.providerSubscriptionId) {
            throw new BadRequestException('Provider subscription mismatch')
        }
        if (snapshot.amount != null && Number(snapshot.amount) !== Number(agreement.amount)) {
            throw new BadRequestException('Provider subscription amount mismatch')
        }
        if (snapshot.currency && String(snapshot.currency).toUpperCase() !== agreement.currency) {
            throw new BadRequestException('Provider subscription currency mismatch')
        }
        if (snapshot.intervalCount != null && Number(snapshot.intervalCount) !== Number(agreement.intervalCount)) {
            throw new BadRequestException('Provider subscription interval count mismatch')
        }
        const expectedUnits: Record<number, string> = { 1: 'DAY', 2: 'WEEK', 3: 'MONTH', 4: 'YEAR' }
        if (
            snapshot.intervalUnit &&
            String(snapshot.intervalUnit).toUpperCase() !== expectedUnits[agreement.providerInterval]
        ) {
            throw new BadRequestException('Provider subscription interval mismatch')
        }
    }

    private async getOrCreateEvent(
        type: string,
        merchant: PaymentMerchant,
        providerId: string,
        status: string,
        body: Record<string, any>,
    ) {
        const idempotencyKey = this.hash(
            `platega-recurrent:${type}:${merchant}:${providerId}:${status}:${String(body.NextChargeAt || '')}`,
        )
        let event = await this.events.findOne({ where: { provider: 'platega-recurrent', idempotencyKey } })
        if (event) return event
        event = this.events.create({
            provider: 'platega-recurrent',
            merchant,
            providerEventId: `${providerId}:${String(status).slice(0, 64)}`,
            providerPaymentId: providerId,
            eventType: type,
            status: String(status).slice(0, 64),
            signatureValid: true,
            processed: false,
            idempotencyKey,
            rawBody: this.safeBody(body),
            headers: {},
            receivedAt: new Date(),
        })
        try {
            return await this.events.save(event)
        } catch {
            return this.events.findOne({ where: { provider: 'platega-recurrent', idempotencyKey } })
        }
    }

    private async completeEvent(event: PaymentWebhookEvent) {
        event.processed = true
        event.processedAt = new Date()
        event.processingError = null
        await this.events.save(event)
    }

    private async failEvent(event: PaymentWebhookEvent, error: any) {
        if (!event) return
        event.processingError = String(error?.message || error || 'callback failed').slice(0, 500)
        await this.events.save(event).catch(() => undefined)
    }

    private safeBody(body: Record<string, any>) {
        return Object.fromEntries(
            ['Id', 'Amount', 'Currency', 'Status', 'PaymentMethod', 'SubscriptionId', 'NextChargeAt']
                .filter((key) => body[key] !== undefined)
                .map((key) => [key, typeof body[key] === 'string' ? body[key].slice(0, 256) : body[key]]),
        )
    }

    private mapMandateStatus(status: string): PlategaRecurrentAgreementStatus | null {
        const key = String(status || '')
            .replace(/[^a-z]/gi, '')
            .toUpperCase()
        return (
            {
                PENDINGAGREEMENT: PlategaRecurrentAgreementStatus.PENDING_AGREEMENT,
                ACTIVE: PlategaRecurrentAgreementStatus.ACTIVE,
                SUBSCRIPTIONACTIVATED: PlategaRecurrentAgreementStatus.ACTIVE,
                PASTDUE: PlategaRecurrentAgreementStatus.PAST_DUE,
                SUBSCRIPTIONPASTDUE: PlategaRecurrentAgreementStatus.PAST_DUE,
                CANCELLED: PlategaRecurrentAgreementStatus.CANCELLED,
                CANCELED: PlategaRecurrentAgreementStatus.CANCELLED,
                SUBSCRIPTIONCANCELLED: PlategaRecurrentAgreementStatus.CANCELLED,
                FAILED: PlategaRecurrentAgreementStatus.FAILED,
                SUBSCRIPTIONFAILED: PlategaRecurrentAgreementStatus.FAILED,
            }[key] || null
        )
    }

    private isTerminal(status: PlategaRecurrentAgreementStatus) {
        return [PlategaRecurrentAgreementStatus.CANCELLED, PlategaRecurrentAgreementStatus.FAILED].includes(status)
    }

    private merchantFor(profile: 'bot' | 'web') {
        return profile === 'web' ? PaymentMerchant.SITE : PaymentMerchant.BOT
    }

    private safeDate(value?: string | null) {
        if (!value) return null
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? null : date
    }

    private requireFuturePaidThroughAt(value?: string | null) {
        const normalized = String(value || '').trim()
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
            throw new BadRequestException('A valid future NextChargeAt is required for confirmed recurrent charges')
        }
        const date = new Date(normalized)
        if (Number.isNaN(date.getTime()) || date <= new Date()) {
            throw new BadRequestException('A valid future NextChargeAt is required for confirmed recurrent charges')
        }
        return date
    }

    private hash(value: string) {
        return createHash('sha256').update(value).digest('hex')
    }
}
