import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BillingAdminService } from './billing-admin.service'
import { BillingService } from './billing.service'
import { MeterController } from './controllers/meter.controller'
import { PlanLimitController } from './controllers/plan-limit.controller'
import { UsageController } from './controllers/usage.controller'
import { Meter } from './entities/meter.entity'
import { PlanLimit } from './entities/plan-limit.entity'
import { SubscriptionBalance } from './entities/subscription-balance.entity'
import { UsageEvent } from './entities/usage-event.entity'
import { UsageLineItem } from './entities/usage-line-item.entity'
import { Plan } from '../plan/entity/plan.entity'
import { Subscription } from '../subscription/entity/subscription.entity'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Meter,
            PlanLimit,
            SubscriptionBalance,
            UsageEvent,
            UsageLineItem,
            Subscription,
            Plan,
        ]),
    ],
    controllers: [MeterController, PlanLimitController, UsageController],
    providers: [BillingService, BillingAdminService],
    exports: [BillingService],
})
export class BillingModule {}
