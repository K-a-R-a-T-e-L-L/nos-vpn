import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPromoController } from './controllers/admin-promo.controller'
import { PromoController } from './controllers/promo.controller'
import { PromoCode } from './entity/promo-code.entity'
import { PromoUsage } from './entity/promo-usage.entity'
import { PromoService } from './services/promo.service'
import { PlanModule } from '../plan/plan.module'
import { PaymentPromoLifecycleService } from './services/payment-promo-lifecycle.service'

@Module({
    imports: [TypeOrmModule.forFeature([PromoCode, PromoUsage]), PlanModule],
    controllers: [AdminPromoController, PromoController],
    providers: [PromoService, PaymentPromoLifecycleService],
    exports: [PromoService, PaymentPromoLifecycleService],
})
export class PromoModule {}
