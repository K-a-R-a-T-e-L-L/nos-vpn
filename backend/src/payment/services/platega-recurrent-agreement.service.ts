import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Plan } from '../../plan/entity/plan.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import {
    AdminPlategaRecurrentAgreementDto,
    AdminPlategaRecurrentCadence,
    CreatePlategaRecurrentAgreementDto,
} from '../dto/platega-recurrent.dto'
import { PlategaRecurrentAgreement } from '../entity/platega-recurrent-agreement.entity'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PlategaRecurrentAgreementStatus } from '../enum/platega-recurrent-agreement-status.enum'
import { PlategaMerchantProfile } from '../providers/platega-payment.provider'
import { PlategaRecurrentPlanPolicy } from '../providers/platega-recurrent-plan.policy'
import { PlategaRecurrentProvider, PlategaSubscriptionSnapshot } from '../providers/platega-recurrent.provider'

const RECURRENT_CONSENT_LEGAL_VERSION = '2.1'

@Injectable()
export class PlategaRecurrentAgreementService {
    constructor(
        private readonly config: ConfigService,
        @InjectRepository(PlategaRecurrentAgreement)
        private readonly agreements: Repository<PlategaRecurrentAgreement>,
        @InjectRepository(Plan) private readonly plans: Repository<Plan>,
        @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
        private readonly provider: PlategaRecurrentProvider,
        private readonly policy: PlategaRecurrentPlanPolicy,
    ) {}

    async create(
        userId: string,
        dto: CreatePlategaRecurrentAgreementDto,
        idempotencyKey: string,
        merchant: PaymentMerchant = PaymentMerchant.SITE,
    ) {
        this.assertFeatureEnabled()
        if (dto.consent !== true) {
            throw new BadRequestException('Explicit recurrent payment consent is required')
        }
        if (!this.provider.isConfigured(this.profileFor(merchant))) {
            throw new ServiceUnavailableException('Platega recurrent provider is not configured')
        }
        const operationKey = String(idempotencyKey || '').trim()
        if (!operationKey || operationKey.length > 128) {
            throw new BadRequestException('A valid Idempotency-Key header is required')
        }
        const duplicate = await this.agreements.findOne({
            where: {
                provider: PaymentProvider.PLATEGA,
                merchant,
                userId,
                createIdempotencyKey: operationKey,
            },
        })
        if (duplicate) return this.toSafeResponse(duplicate)

        const [plan, subscription] = await Promise.all([
            this.plans.findOne({ where: { id: dto.planId, isActive: true } }),
            this.subscriptions.findOne({ where: { userId } }),
        ])
        if (!plan) throw new NotFoundException('Plan not found')
        if (!subscription) throw new NotFoundException('Subscription not found')

        // Product policy owns the only approved 30-day/month and 360-day/year mapping.
        const terms = this.policy.map(plan)
        let agreement = this.agreements.create({
            provider: PaymentProvider.PLATEGA,
            merchant,
            userId,
            subscriptionId: subscription.id,
            planId: plan.id,
            planSnapshot: {
                id: plan.id,
                code: plan.code || null,
                name: plan.name,
                period: plan.period,
                amount: plan.amount,
                devicesLimit: plan.devicesLimit ?? null,
            },
            createIdempotencyKey: operationKey,
            normalizedStatus: PlategaRecurrentAgreementStatus.CREATING,
            amount: terms.amount,
            currency: terms.currency,
            providerInterval: terms.interval,
            intervalCount: terms.intervalCount,
            durationDays: terms.durationDays,
            consentAcceptedAt: new Date(),
            consentLegalVersion: RECURRENT_CONSENT_LEGAL_VERSION,
        })
        try {
            agreement = await this.agreements.save(agreement)
        } catch {
            agreement = await this.agreements.findOne({
                where: {
                    provider: PaymentProvider.PLATEGA,
                    merchant,
                    userId,
                    createIdempotencyKey: operationKey,
                },
            })
            if (!agreement) throw new BadRequestException('Unable to reserve recurrent agreement operation')
            return this.toSafeResponse(agreement)
        }

        const snapshot = await this.provider.createSubscription({
            merchantProfile: this.profileFor(merchant),
            amount: terms.amount,
            currency: terms.currency,
            interval: terms.interval,
            intervalCount: terms.intervalCount,
            description: `NOS VPN ${plan.name}`.slice(0, 128),
        })
        this.applySnapshot(agreement, snapshot)
        agreement.redirectUrl = snapshot.redirect || null
        await this.agreements.save(agreement)
        return this.toSafeResponse(agreement)
    }

    async readOwn(id: string, userId: string) {
        this.assertFeatureEnabled()
        const agreement = await this.agreements.findOne({ where: { id, userId } })
        if (!agreement) throw new NotFoundException('Recurrent agreement not found')
        return this.toSafeResponse(agreement)
    }

    async listForAdminUser(userId: string): Promise<AdminPlategaRecurrentAgreementDto[]> {
        const agreements = await this.agreements.find({ where: { userId }, order: { createdAt: 'DESC' } })
        return agreements.map((agreement) => this.toAdminReadModel(agreement))
    }

    async cancelForAdminUser(userId: string, agreementId: string): Promise<AdminPlategaRecurrentAgreementDto> {
        const agreement = await this.findForAdminUser(userId, agreementId)
        await this.cancelAgreement(agreement)
        return this.toAdminReadModel(agreement)
    }

    async reconcileForAdminUser(userId: string, agreementId: string): Promise<AdminPlategaRecurrentAgreementDto> {
        const agreement = await this.findForAdminUser(userId, agreementId)
        await this.reconcileAgreement(agreement)
        return this.toAdminReadModel(agreement)
    }

    async cancelByAdmin(id: string) {
        const agreement = await this.agreements.findOne({ where: { id } })
        if (!agreement) throw new NotFoundException('Recurrent agreement not found')
        await this.cancelAgreement(agreement)
        return this.toSafeResponse(agreement)
    }

    private async cancelAgreement(agreement: PlategaRecurrentAgreement) {
        if (agreement.normalizedStatus === PlategaRecurrentAgreementStatus.CANCELLED) {
            return
        }
        if (!agreement.providerSubscriptionId) throw new BadRequestException('Provider subscription is not available')
        agreement.cancelRequestedAt ||= new Date()
        const snapshot = await this.provider.cancelSubscription(
            agreement.providerSubscriptionId,
            this.profileFor(agreement.merchant),
        )
        this.applySnapshot(agreement, snapshot)
        await this.agreements.save(agreement)
    }

    async reconcileByAdmin(id: string) {
        const agreement = await this.agreements.findOne({ where: { id } })
        if (!agreement) throw new NotFoundException('Recurrent agreement not found')
        await this.reconcileAgreement(agreement)
        return this.toSafeResponse(agreement)
    }

    private async reconcileAgreement(agreement: PlategaRecurrentAgreement) {
        if (!agreement.providerSubscriptionId) throw new BadRequestException('Provider subscription is not available')
        const snapshot = await this.provider.getSubscription(
            agreement.providerSubscriptionId,
            this.profileFor(agreement.merchant),
        )
        this.validateProviderSnapshot(agreement, snapshot)
        this.applySnapshot(agreement, snapshot)
        await this.agreements.save(agreement)
    }

    applySnapshot(agreement: PlategaRecurrentAgreement, snapshot: PlategaSubscriptionSnapshot) {
        agreement.providerSubscriptionId = snapshot.providerSubscriptionId
        agreement.rawProviderStatus = snapshot.status.slice(0, 64)
        agreement.normalizedStatus = this.mapStatus(snapshot.status)
        const nextChargeAt = this.safeDate(snapshot.nextChargeAt)
        if (nextChargeAt) agreement.nextChargeAt = nextChargeAt
        agreement.lastChargeAt = this.safeDate(snapshot.lastChargeAt) || agreement.lastChargeAt
        if (agreement.normalizedStatus === PlategaRecurrentAgreementStatus.CANCELLED) {
            agreement.providerCancelledAt ||= new Date()
            agreement.cancelledAt ||= new Date()
        }
    }

    mapStatus(status: string): PlategaRecurrentAgreementStatus {
        const normalized = String(status || '')
            .replace(/[^a-z]/gi, '')
            .toUpperCase()
        const map: Record<string, PlategaRecurrentAgreementStatus> = {
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
        }
        return map[normalized] || PlategaRecurrentAgreementStatus.UNKNOWN
    }

    toSafeResponse(agreement: PlategaRecurrentAgreement) {
        return {
            id: agreement.id,
            providerSubscriptionId: agreement.providerSubscriptionId || null,
            merchant: agreement.merchant,
            status: agreement.normalizedStatus,
            providerStatus: agreement.rawProviderStatus || null,
            amount: agreement.amount,
            currency: agreement.currency,
            durationDays: agreement.durationDays,
            redirect: agreement.redirectUrl || null,
            nextChargeAt: agreement.nextChargeAt || null,
            lastChargeAt: agreement.lastChargeAt || null,
            cancelledAt: agreement.cancelledAt || null,
            createdAt: agreement.createdAt,
        }
    }

    private toAdminReadModel(agreement: PlategaRecurrentAgreement): AdminPlategaRecurrentAgreementDto {
        const planSnapshot = agreement.planSnapshot || {}
        const planPeriodDays = Number(planSnapshot.period)
        return {
            id: agreement.id,
            userId: agreement.userId,
            merchant: agreement.merchant,
            status: agreement.normalizedStatus,
            providerStatus: agreement.rawProviderStatus || null,
            planId: agreement.planId,
            planName: typeof planSnapshot.name === 'string' ? planSnapshot.name : null,
            planPeriodDays: Number.isFinite(planPeriodDays) && planPeriodDays > 0 ? planPeriodDays : null,
            amount: agreement.amount,
            currency: agreement.currency,
            cadence: this.getAdminCadence(agreement),
            nextChargeAt: agreement.nextChargeAt || null,
            lastChargeAt: agreement.lastChargeAt || null,
            cancelledAt: agreement.cancelledAt || null,
            consentAcceptedAt: agreement.consentAcceptedAt || null,
            consentLegalVersion: agreement.consentLegalVersion || null,
            canCancel: !this.isTerminal(agreement.normalizedStatus) && Boolean(agreement.providerSubscriptionId),
            canReconcile: Boolean(agreement.providerSubscriptionId),
            createdAt: agreement.createdAt,
        }
    }

    private getAdminCadence(agreement: PlategaRecurrentAgreement): AdminPlategaRecurrentCadence | null {
        if (agreement.intervalCount !== 1) return null
        if (agreement.providerInterval === 3) return AdminPlategaRecurrentCadence.MONTHLY
        if (agreement.providerInterval === 4) return AdminPlategaRecurrentCadence.YEARLY
        return null
    }

    private isTerminal(status: PlategaRecurrentAgreementStatus) {
        return [PlategaRecurrentAgreementStatus.CANCELLED, PlategaRecurrentAgreementStatus.FAILED].includes(status)
    }

    private async findForAdminUser(userId: string, agreementId: string) {
        const agreement = await this.agreements.findOne({ where: { id: agreementId, userId } })
        if (!agreement) throw new NotFoundException('Recurrent agreement not found')
        return agreement
    }

    private assertFeatureEnabled() {
        if (this.config.get<string>('PLATEGA_RECURRENT_ENABLED') !== 'true') {
            throw new ServiceUnavailableException('Platega recurrent subscriptions are disabled')
        }
    }

    private validateProviderSnapshot(agreement: PlategaRecurrentAgreement, snapshot: PlategaSubscriptionSnapshot) {
        if (snapshot.providerSubscriptionId !== agreement.providerSubscriptionId) {
            throw new BadRequestException('Provider subscription mismatch')
        }
        if (snapshot.amount != null && Number(snapshot.amount) !== Number(agreement.amount)) {
            throw new BadRequestException('Provider subscription amount mismatch')
        }
        if (snapshot.currency && snapshot.currency.toUpperCase() !== agreement.currency) {
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

    private profileFor(merchant: PaymentMerchant): PlategaMerchantProfile {
        return merchant === PaymentMerchant.SITE ? 'web' : 'bot'
    }

    private safeDate(value?: string | null): Date | null {
        if (!value) return null
        const result = new Date(value)
        return Number.isNaN(result.getTime()) ? null : result
    }
}
