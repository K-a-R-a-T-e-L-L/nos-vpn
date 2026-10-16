import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminAnalyticsController } from './controllers/admin-analytics.controller'
import { UserAttributionController } from './controllers/user-attribution.controller'
import { AnalyticsEvent } from './entity/analytics-event.entity'
import { TrafficSource } from './entity/traffic-source.entity'
import { UserAttribution } from './entity/user-attribution.entity'
import { AdminFinanceAnalyticsService } from './services/admin-finance-analytics.service'
import { AdminReferrerAnalyticsService } from './services/admin-referrer-analytics.service'
import { AdminRetentionAnalyticsService } from './services/admin-retention-analytics.service'
import { AnalyticsAttributionService } from './services/analytics-attribution.service'
import { AnalyticsEventService } from './services/analytics-event.service'
import { AnalyticsQueryService } from './services/analytics-query.service'
import { AnalyticsService } from './services/analytics.service'
import { Payment } from '../payment/entity/payment.entity'
import { Plan } from '../plan/entity/plan.entity'
import { ReferralBonusLedger } from '../referral/entity/referral-bonus-ledger.entity'
import { User } from '../system/user/entity/user.entity'

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            TrafficSource,
            UserAttribution,
            AnalyticsEvent,
            User,
            Payment,
            Plan,
            ReferralBonusLedger,
        ]),
    ],
    controllers: [AdminAnalyticsController, UserAttributionController],
    providers: [
        AnalyticsService,
        AnalyticsAttributionService,
        AnalyticsEventService,
        AnalyticsQueryService,
        AdminFinanceAnalyticsService,
            AdminReferrerAnalyticsService,
            AdminRetentionAnalyticsService,
    ],
    exports: [AnalyticsService],
})
export class AnalyticsModule {}
