import { Injectable } from '@nestjs/common'

import { AnalyticsAttributionService } from './analytics-attribution.service'
import { AnalyticsQueryService } from './analytics-query.service'
import { Plan } from '../../plan/entity/plan.entity'
import { CreateTrafficSourceDto } from '../dto/create-traffic-source.dto'
import { UpdateTrafficSourceDto } from '../dto/update-traffic-source.dto'

export { AnalyticsEventType } from './analytics-event.service'

@Injectable()
export class AnalyticsService {
    constructor(
        private readonly attributionService: AnalyticsAttributionService,
        private readonly queryService: AnalyticsQueryService,
    ) {}

    async createSource(dto: CreateTrafficSourceDto) {
        return this.queryService.createSource(dto)
    }

    async updateSource(id: string, dto: UpdateTrafficSourceDto) {
        return this.queryService.updateSource(id, dto)
    }

    async deleteSource(id: string) {
        return this.queryService.deleteSource(id)
    }

    async claimUserSource(
        userId: string,
        rawSourceCode?: string | null,
        options?: { entryPoint?: string; landingPath?: string | null },
    ) {
        return this.attributionService.claimUserSource(userId, rawSourceCode, options)
    }

    async trackBotStart(userId: string, startPayload?: string | null) {
        return this.attributionService.trackBotStart(userId, startPayload)
    }

    async trackTrialStarted(userId: string, plan?: Pick<Plan, 'id' | 'code' | 'title' | 'name'> | null) {
        return this.attributionService.trackTrialStarted(userId, plan)
    }

    async trackPlanSelected(userId: string, plan: Pick<Plan, 'id' | 'code' | 'title' | 'name'>) {
        return this.attributionService.trackPlanSelected(userId, plan)
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
        return this.attributionService.trackPaymentSucceeded(input)
    }

    async trackAccessViewed(userId: string, metadata?: Record<string, any>) {
        return this.attributionService.trackAccessViewed(userId, metadata)
    }

    async trackQrOpened(userId: string) {
        return this.attributionService.trackQrOpened(userId)
    }

    async trackReferralAttached(userId: string, referralCode: string) {
        return this.attributionService.trackReferralAttached(userId, referralCode)
    }

    async trackReferralFriendPaid(input: {
        referredUserId: string
        referrerUserId: string
        amountRub: number
        paidAt?: Date
    }) {
        return this.attributionService.trackReferralFriendPaid(input)
    }

    async getOverview() {
        return this.queryService.getOverview()
    }

    async listSourcesWithMetrics(page = 1, pageSize = 20) {
        return this.queryService.listSourcesWithMetrics(page, pageSize)
    }

    async listAttributedUsers(search?: string, page = 1, pageSize = 25) {
        return this.queryService.listAttributedUsers(search, page, pageSize)
    }
}
