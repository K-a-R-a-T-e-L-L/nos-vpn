import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserAdminController } from './controllers/user.admin.controller'
import { UserController } from './controllers/user.controller'
import { TelegramAuthRequest } from './entity/telegram-auth-request.entity'
import { TelegramSiteLinkRequest } from './entity/telegram-site-link-request.entity'
import { User } from './entity/user.entity'
import { RoleGuard } from './guards/role.guard'
import { UserGuard } from './guards/user.guard'
import { UserAdminService } from './services/user-admin.service'
import { UserAuthLinkService } from './services/user-auth-link.service'
import { UserDeleteService } from './services/user-delete.service'
import { UserProvisioningService } from './services/user-provisioning.service'
import { UserService } from './services/user.service'
import { UserAttribution } from '../../analytics/entity/user-attribution.entity'
import { Payment } from '../../payment/entity/payment.entity'
import { PaymentModule } from '../../payment/payment.module'
import { Plan } from '../../plan/entity/plan.entity'
import { PlanModule } from '../../plan/plan.module'
import { PromoCode } from '../../promo/entity/promo-code.entity'
import { PromoUsage } from '../../promo/entity/promo-usage.entity'
import { ReferralBonusLedger } from '../../referral/entity/referral-bonus-ledger.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { SubscriptionModule } from '../../subscription/subscription.module'
import { SupportMessage } from '../../support/entity/support-message.entity'
import { SupportThread } from '../../support/entity/support-thread.entity'
import { SupportModule } from '../../support/support.module'
import { VpnAccessModule } from '../../vpn-access/vpn-access.module'
import { VpnProviderModule } from '../../vpn-provider/vpn-provider.module'

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            TelegramAuthRequest,
            TelegramSiteLinkRequest,
            Payment,
            PromoUsage,
            ReferralBonusLedger,
            UserAttribution,
            SupportThread,
            SupportMessage,
            Subscription,
            Plan,
            PromoCode,
        ]),
        JwtModule,
        SubscriptionModule,
        PlanModule,
        PaymentModule,
        VpnAccessModule,
        VpnProviderModule,
        SupportModule,
    ],
    providers: [
        UserService,
        UserAdminService,
        UserAuthLinkService,
        UserDeleteService,
        UserProvisioningService,
        ConfigModule,
        UserGuard,
        RoleGuard,
    ],
    controllers: [UserController, UserAdminController],
    exports: [UserService, JwtModule],
})
export class UserModule {}
