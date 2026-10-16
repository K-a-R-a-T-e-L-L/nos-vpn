import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { AnalyticsEventService, AnalyticsEventType } from './analytics-event.service'
import {
    extractAnalyticsSourceCodeFromStartPayload,
    normalizeAnalyticsSourceCode,
    normalizeOptionalAnalyticsSourceCode,
} from './analytics-mapper'
import { Plan } from '../../plan/entity/plan.entity'
import { TrafficSource } from '../entity/traffic-source.entity'
import { UserAttribution } from '../entity/user-attribution.entity'

@Injectable()
export class AnalyticsAttributionService {
    constructor(
        @InjectRepository(TrafficSource)
        private readonly trafficSourceRepository: Repository<TrafficSource>,
        @InjectRepository(UserAttribution)
        private readonly userAttributionRepository: Repository<UserAttribution>,
        private readonly analyticsEventService: AnalyticsEventService,
    ) {}

    async claimUserSource(
        userId: string,
        rawSourceCode?: string | null,
        options?: { entryPoint?: string; landingPath?: string | null },
    ) {
        const sourceCode = normalizeOptionalAnalyticsSourceCode(rawSourceCode)
        const source = sourceCode ? await this.findActiveSourceByCode(sourceCode) : null
        let attribution = await this.userAttributionRepository.findOne({ where: { userId } })

        if (!attribution) {
            attribution = this.userAttributionRepository.create({
                userId,
            })
        }

        const now = new Date()
        if (!attribution.sourceId && source) {
            attribution.sourceId = source.id
            attribution.sourceCodeSnapshot = source.code
        }
        if (!attribution.claimedAt) {
            attribution.claimedAt = now
        }
        if (options?.entryPoint && !attribution.entryPoint) {
            attribution.entryPoint = options.entryPoint
        }
        if (options?.landingPath && !attribution.landingPath) {
            attribution.landingPath = options.landingPath
        }

        const saved = await this.userAttributionRepository.save(attribution)
        await this.analyticsEventService.recordEvent({
            userId,
            sourceId: saved.sourceId,
            eventType: AnalyticsEventType.SOURCE_CLAIMED,
            metadata: {
                sourceCode: saved.sourceCodeSnapshot,
                entryPoint: options?.entryPoint || null,
                landingPath: options?.landingPath || null,
            },
        })
        return saved
    }

    async trackBotStart(userId: string, startPayload?: string | null) {
        const sourceCode = extractAnalyticsSourceCodeFromStartPayload(startPayload)
        const source = sourceCode ? await this.findActiveSourceByCode(sourceCode).catch(() => null) : null
        const attribution = await this.ensureAttribution(userId)
        attribution.botStartedAt = attribution.botStartedAt || new Date()
        attribution.entryPoint = attribution.entryPoint || 'telegram'
        if (!attribution.sourceId && source) {
            attribution.sourceId = source.id
            attribution.sourceCodeSnapshot = source.code
        }
        const saved = await this.userAttributionRepository.save(attribution)
        await this.analyticsEventService.recordEvent({
            userId,
            sourceId: saved.sourceId,
            eventType: AnalyticsEventType.BOT_START,
            metadata: { startPayload: startPayload || null },
        })
        return saved
    }

    async trackTrialStarted(userId: string, plan?: Pick<Plan, 'id' | 'code' | 'title' | 'name'> | null) {
        const attribution = await this.ensureAttribution(userId)
        attribution.trialStartedAt = attribution.trialStartedAt || new Date()
        if (plan?.id) {
            attribution.firstPlanId = attribution.firstPlanId || plan.id
            attribution.latestPlanId = plan.id
        }
        const saved = await this.userAttributionRepository.save(attribution)
        await this.analyticsEventService.recordEvent({
            userId,
            sourceId: saved.sourceId,
            eventType: AnalyticsEventType.TRIAL_STARTED,
            metadata: {
                planId: plan?.id || null,
                planCode: plan?.code || null,
                planTitle: plan?.title || plan?.name || null,
            },
        })
        return saved
    }

    async trackPlanSelected(userId: string, plan: Pick<Plan, 'id' | 'code' | 'title' | 'name'>) {
        const attribution = await this.ensureAttribution(userId)
        attribution.firstPlanId = attribution.firstPlanId || plan.id
        attribution.latestPlanId = plan.id
        const saved = await this.userAttributionRepository.save(attribution)
        await this.analyticsEventService.recordEvent({
            userId,
            sourceId: saved.sourceId,
            eventType: AnalyticsEventType.PLAN_SELECTED,
            metadata: {
                planId: plan.id,
                planCode: plan.code,
                planTitle: plan.title || plan.name || null,
            },
        })
        return saved
    }

    async trackPaymentSucceeded(input: {
        userId: string
        amountRub: number
        planId?: string | null
        planCode?: string | null
        planTitle?: string | null
        paidAt?: Date
        isAfterTrial?: boolean
    }) {
        const attribution = await this.ensureAttribution(input.userId)
        const paidAt = input.paidAt || new Date()
        attribution.firstPaymentAt = attribution.firstPaymentAt || paidAt
        if (input.isAfterTrial && !attribution.firstPostTrialPaymentAt) {
            attribution.firstPostTrialPaymentAt = paidAt
        }
        if (input.planId) {
            attribution.firstPlanId = attribution.firstPlanId || input.planId
            attribution.latestPlanId = input.planId
        }
        const saved = await this.userAttributionRepository.save(attribution)
        await this.analyticsEventService.recordEvent({
            userId: input.userId,
            sourceId: saved.sourceId,
            eventType: AnalyticsEventType.PAYMENT_SUCCEEDED,
            amountRub: input.amountRub,
            occurredAt: paidAt,
            metadata: {
                planId: input.planId || null,
                planCode: input.planCode || null,
                planTitle: input.planTitle || null,
                isAfterTrial: Boolean(input.isAfterTrial),
            },
        })
        return saved
    }

    async trackAccessViewed(userId: string, metadata?: Record<string, any>) {
        const attribution = await this.ensureAttribution(userId)
        attribution.accessViewedAt = attribution.accessViewedAt || new Date()
        const saved = await this.userAttributionRepository.save(attribution)
        await this.analyticsEventService.recordEvent({
            userId,
            sourceId: saved.sourceId,
            eventType: AnalyticsEventType.ACCESS_VIEWED,
            metadata,
        })
        return saved
    }

    async trackQrOpened(userId: string) {
        const attribution = await this.ensureAttribution(userId)
        attribution.qrOpenedAt = attribution.qrOpenedAt || new Date()
        const saved = await this.userAttributionRepository.save(attribution)
        await this.analyticsEventService.recordEvent({
            userId,
            sourceId: saved.sourceId,
            eventType: AnalyticsEventType.QR_OPENED,
        })
        return saved
    }

    async trackReferralAttached(userId: string, referralCode: string) {
        const attribution = await this.ensureAttribution(userId)
        await this.analyticsEventService.recordEvent({
            userId,
            sourceId: attribution.sourceId,
            eventType: AnalyticsEventType.REFERRAL_ATTACHED,
            metadata: { referralCode },
        })
    }

    async trackReferralFriendPaid(input: {
        referredUserId: string
        referrerUserId: string
        amountRub: number
        paidAt?: Date
    }) {
        const referrerAttribution = await this.userAttributionRepository.findOne({
            where: { userId: input.referrerUserId },
        })
        await this.analyticsEventService.recordEvent({
            userId: input.referrerUserId,
            sourceId: referrerAttribution?.sourceId || null,
            eventType: AnalyticsEventType.REFERRAL_FRIEND_PAID,
            amountRub: input.amountRub,
            occurredAt: input.paidAt,
            metadata: {
                referredUserId: input.referredUserId,
            },
        })
    }

    private async ensureAttribution(userId: string) {
        const existing = await this.userAttributionRepository.findOne({ where: { userId } })
        if (existing) {
            return existing
        }

        return this.userAttributionRepository.save({
            userId,
            claimedAt: new Date(),
        })
    }

    private async findActiveSourceByCode(code: string) {
        const source = await this.trafficSourceRepository.findOne({
            where: {
                code: normalizeAnalyticsSourceCode(code),
                isActive: true,
            },
        })
        if (!source) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Traffic source not found')
        }
        return source
    }
}
