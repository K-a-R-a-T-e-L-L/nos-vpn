import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BotNavigationService } from './bot-navigation.service'
import { BotUpdate } from './bot.update'
import { StartCommand } from './commands/start.command'
import { PaymentModule } from '../payment/payment.module'
import { PlanModule } from '../plan/plan.module'
import { ReferralModule } from '../referral/referral.module'
import { SubscriptionModule } from '../subscription/subscription.module'
import { SupportModule } from '../support/support.module'
import { User } from '../system/user/entity/user.entity'
import { VpnAccessModule } from '../vpn-access/vpn-access.module'

@Module({
    imports: [TypeOrmModule.forFeature([User]), SubscriptionModule, VpnAccessModule, PlanModule, ReferralModule, PaymentModule, SupportModule],
    providers: [BotUpdate, StartCommand, BotNavigationService],
})
export class BotModule {}
