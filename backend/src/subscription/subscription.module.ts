import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt'
import {TypeOrmModule} from "@nestjs/typeorm";

import {Subscription} from "./entity/subscription.entity";
import { SubscriptionService } from './services/subscription.service'
import { PaymentModule } from '../payment/payment.module'
import { AdminSubscriptionController } from './controllers/admin.subscription.controller'
import { SubscriptionController } from './controllers/subscription.controller'
import { SubscriptionUserController } from './controllers/subscription.user.controller'
import { SubscriptionRenewal } from './entity/subscription-renewal.entity'
import { SubscriptionGraceJob } from './jobs/subscription-grace.job'
import { SubscriptionRecurrentPaymentJob } from './jobs/subscription-recurrent-payment.job'
import { SubscriptionRenewalReminderJob } from './jobs/subscription-renewal-reminder.job'
import { SubscriptionAutoRenewService } from './services/subscription-auto-renew.service'
import { SubscriptionLifecycleOrchestrator } from './services/subscription-lifecycle.orchestrator'
import { BillingModule } from '../billing/billing.module'
import { PaymentAttempt } from '../payment/entity/payment-attempt.entity'
import { Payment } from '../payment/entity/payment.entity'
import { Plan } from '../plan/entity/plan.entity'
import { PromoModule } from '../promo/promo.module'
import { ReferralModule } from '../referral/referral.module'
import { SubscriptionPolicyModule } from '../subscription-policy/subscription-policy.module'
import { User } from '../system/user/entity/user.entity'
import { VpnAccessModule } from '../vpn-access/vpn-access.module'
import { VpnProviderModule } from '../vpn-provider/vpn-provider.module'

@Module({
    imports: [
        TypeOrmModule.forFeature([Subscription, Plan, User, SubscriptionRenewal, Payment, PaymentAttempt]),
        forwardRef(() => PaymentModule),
        JwtModule,
        forwardRef(() => VpnAccessModule),
        VpnProviderModule,
        SubscriptionPolicyModule,
        PromoModule,
        ReferralModule,
        BillingModule,
    ],
    controllers: [SubscriptionUserController, SubscriptionController, AdminSubscriptionController],
    providers: [
        SubscriptionService,
        SubscriptionLifecycleOrchestrator,
        SubscriptionRenewalReminderJob,
        SubscriptionGraceJob,
        SubscriptionAutoRenewService,
        SubscriptionRecurrentPaymentJob,
    ],
    exports: [SubscriptionService, SubscriptionLifecycleOrchestrator, SubscriptionAutoRenewService],
})
export class SubscriptionModule {}
