import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TelegrafModule } from 'nestjs-telegraf'

import { AnalyticsModule } from './analytics/analytics.module'
import { BillingModule } from './billing/billing.module'
import { BotModule } from './bot/bot.module'
import { buildDataSourceOptions } from './database.provider'
import { validationSchema } from './env.validation'
import { TelegramLoggerModule } from './logger/logger.module'
import { NotificationModule } from './notification/notification.module'
import { PaymentModule } from './payment/payment.module'
import { PlanModule } from './plan/plan.module'
import { PromoModule } from './promo/promo.module'
import { ReferralModule } from './referral/referral.module'
import { SubscriptionModule } from './subscription/subscription.module'
import { SubscriptionPolicyModule } from './subscription-policy/subscription-policy.module'
import { SupportModule } from './support/support.module'
import { UserModule } from './system/user/user.module'
import { TELEGRAM_DESTINATION, resolveTelegramDestination } from './telegram/telegram-destination'
import { VpnAccessModule } from './vpn-access/vpn-access.module'
import { VpnProviderModule } from './vpn-provider/vpn-provider.module'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema,
        }),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: buildDataSourceOptions,
        }),
        TelegrafModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                token: configService.get('TELEGRAM_TOKEN'),
                launchOptions:
                    configService.get<string>('TELEGRAM_BOT_LAUNCH') === 'false'
                        ? false
                        : { dropPendingUpdates: true },
                options: {
                    telegram: {
                        testEnv: false,
                    },
                },
                include: [BotModule],
            }),
        }),
        TelegramLoggerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                chatId: resolveTelegramDestination(configService, TELEGRAM_DESTINATION.LOGS),
            }),
        }),
        NotificationModule,
        EventEmitterModule.forRoot(),
        UserModule,
        BotModule,
        PlanModule,
        PaymentModule,
        SubscriptionModule,
        BillingModule,
        VpnProviderModule,
        VpnAccessModule,
        SubscriptionPolicyModule,
        PromoModule,
        ReferralModule,
        SupportModule,
        AnalyticsModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
