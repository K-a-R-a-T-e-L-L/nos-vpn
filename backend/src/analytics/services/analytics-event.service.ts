import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { roundAnalyticsMoney } from './analytics-mapper'
import { AnalyticsEvent } from '../entity/analytics-event.entity'

export const AnalyticsEventType = {
    SOURCE_CLAIMED: 'SOURCE_CLAIMED',
    BOT_START: 'BOT_START',
    TRIAL_STARTED: 'TRIAL_STARTED',
    PLAN_SELECTED: 'PLAN_SELECTED',
    PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
    ACCESS_VIEWED: 'ACCESS_VIEWED',
    QR_OPENED: 'QR_OPENED',
    REFERRAL_ATTACHED: 'REFERRAL_ATTACHED',
    REFERRAL_FRIEND_PAID: 'REFERRAL_FRIEND_PAID',
} as const

type AnalyticsEventTypeValue = (typeof AnalyticsEventType)[keyof typeof AnalyticsEventType]

export interface RecordAnalyticsEventInput {
    userId?: string | null
    sourceId?: string | null
    eventType: AnalyticsEventTypeValue
    amountRub?: number | null
    metadata?: Record<string, any> | null
    occurredAt?: Date
}

@Injectable()
export class AnalyticsEventService {
    constructor(
        @InjectRepository(AnalyticsEvent)
        private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
    ) {}

    async recordEvent(input: RecordAnalyticsEventInput) {
        return this.analyticsEventRepository.save({
            userId: input.userId || null,
            sourceId: input.sourceId || null,
            eventType: input.eventType,
            amountRub: input.amountRub === undefined ? null : roundAnalyticsMoney(input.amountRub || 0),
            metadata: input.metadata || null,
            occurredAt: input.occurredAt || new Date(),
        })
    }
}
