import { OnModuleInit, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isUUID } from 'class-validator'
import { Action, Command, Ctx, Hears, InjectBot, On, Start, Update } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { buildBotPrePaymentLegalButtonRows } from './bot-legal'
import { BotNavigationService } from './bot-navigation.service'
import { BOT_CALLBACK, BOT_MENU } from './bot.constants'
import { StartCommand } from './commands/start.command'
import { tgEmoji } from './custom-emoji.registry'
import { SUPPORT_THREAD_UUID_PATTERN } from './support-admin-reply'
import { AnalyticsService } from '../analytics/services/analytics.service'
import { TelegramLoggerService } from '../logger/logger.service'
import { BotMessageRoutingFlow } from './flows/message-routing.flow'
import { PaymentMerchant } from '../payment/enum/payment-merchant.enum'
import { PaymentCheckoutOptionsService } from '../payment/services/payment-checkout-options.service'
import { PaymentService } from '../payment/services/payment.service'
import { PlategaRecurrentAgreementService } from '../payment/services/platega-recurrent-agreement.service'
import { PlanService } from '../plan/services/plan.service'
import { ReferralService } from '../referral/services/referral.service'
import { ActionsEnum } from '../subscription/enum/actions.enum'
import { SubscriptionAutoRenewService } from '../subscription/services/subscription-auto-renew.service'
import { SubscriptionService } from '../subscription/services/subscription.service'
import { SupportService } from '../support/services/support.service'
import { UserService } from '../system/user/services/user.service'
import { AccessPresentationService } from '../vpn-access/services/access-presentation.service'

@Update()
export class BotUpdate extends BotMessageRoutingFlow implements OnModuleInit {
    constructor(
        userService: UserService,
        logger: TelegramLoggerService,
        startCommand: StartCommand,
        subscriptionService: SubscriptionService,
        accessPresentationService: AccessPresentationService,
        planService: PlanService,
        referralService: ReferralService,
        paymentService: PaymentService,
        checkoutOptionsService: PaymentCheckoutOptionsService,
        recurrentAgreementService: PlategaRecurrentAgreementService,
        supportService: SupportService,
        configService: ConfigService,
        navigationService: BotNavigationService,
        analyticsService: AnalyticsService,
        @InjectBot() bot: Telegraf,
        @Optional() autoRenewService?: SubscriptionAutoRenewService,
    ) {
        super(
            userService,
            logger,
            startCommand,
            subscriptionService,
            accessPresentationService,
            planService,
            referralService,
            paymentService,
            checkoutOptionsService,
            recurrentAgreementService,
            supportService,
            configService,
            navigationService,
            analyticsService,
            bot,
            autoRenewService,
        )
    }

    onModuleInit() {
        this.logger.log('Bot module initialized', BotUpdate.name)
    }

    @Start()
    async start(@Ctx() ctx: TelegrafContext) {
        await this.handleStart(ctx)
    }

    @Command('start')
    async startCommandAlias(@Ctx() ctx: TelegrafContext) {
        await this.start(ctx)
    }

    @Command('my_subscription')
    async mySubscriptionCommand(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, '/my_subscription', async () => {
            this.logger.log(`Bot /my_subscription received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            this.logger.log('Bot /my_subscription BEFORE handleMySubscription', BotUpdate.name)
            await this.openNavigationSection(ctx, 'my_subscription', () => this.handleMySubscription(ctx))
            this.logger.log('Bot /my_subscription AFTER handleMySubscription', BotUpdate.name)
        })
    }

    @Command('get_access')
    async getAccessCommand(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, '/get_access', async () => {
            this.logger.log(`Bot /get_access received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            this.logger.log('Bot /get_access BEFORE handleGetAccess', BotUpdate.name)
            await this.openNavigationSection(ctx, 'get_access', () => this.handleGetAccess(ctx))
            this.logger.log('Bot /get_access AFTER handleGetAccess', BotUpdate.name)
        })
    }

    @Command('info')
    async infoCommand(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, '/info', async () => {
            this.logger.log(`Bot /info received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            await this.openNavigationSection(ctx, 'info', () => this.showInfo(ctx))
        })
    }

    @Command('code')
    async codeCommand(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, '/code', async () => {
            this.logger.log(`Bot /code received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            await this.handleEmojiCodeCommand(ctx)
        })
    }

    @Command('emoji_check')
    async emojiCheckCommand(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, '/emoji_check', async () => {
            this.logger.log(`Bot /emoji_check received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            await this.handleEmojiCheckCommand(ctx)
        })
    }

    @Command('broadcast')
    async adminBroadcastCommand(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, '/broadcast', async () => {
            await this.enterAdminBroadcastMode(ctx)
        })
    }

    @Hears(BOT_MENU.MENU)
    async mainMenuFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'menu:main', async () => {
            await this.showMainMenu(ctx, true)
        })
    }

    @Hears(BOT_MENU.BACK)
    async backFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'menu:back', async () => {
            if (ctx.from) {
                this.promoAwaitingUsers.delete(String(ctx.from.id))
                this.adminBroadcastAwaitingUsers.delete(String(ctx.from.id))
                this.adminBroadcastDrafts.delete(String(ctx.from.id))
            }
            await this.showMainMenu(ctx, true)
        })
    }

    @Hears(BOT_MENU.TARIFFS)
    async tariffsFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.openNavigationSection(ctx, 'tariffs', () => this.showTariffs(ctx))
    }

    @Hears(BOT_MENU.MY_SUBSCRIPTION)
    async mySubscriptionFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'menu:my_subscription', async () => {
            this.logger.log(`Bot menu my_subscription received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            await this.openNavigationSection(ctx, 'my_subscription', () => this.handleMySubscription(ctx))
        })
    }

    @Hears(BOT_MENU.GET_ACCESS)
    async getAccessFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'menu:get_access', async () => {
            this.logger.log(`Bot menu get_access received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            await this.openNavigationSection(ctx, 'get_access', () => this.handleGetAccess(ctx))
        })
    }

    @Hears(BOT_MENU.RENEW)
    async renewFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.openNavigationSection(ctx, 'renew', () => this.showRenew(ctx))
    }

    @Hears(BOT_MENU.REFERRAL)
    async referralFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.openNavigationSection(ctx, 'referral', () => this.showReferral(ctx))
    }

    @Hears(BOT_MENU.WALLET)
    async walletFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.openNavigationSection(ctx, 'wallet', () => this.showWallet(ctx))
    }

    @Hears(BOT_MENU.FAQ)
    async faqFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'menu:faq', async () => {
            await this.openNavigationSection(ctx, 'faq', () => this.showFaq(ctx))
        })
    }

    @Hears(BOT_MENU.INFO)
    async infoFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'menu:info', async () => {
            await this.openNavigationSection(ctx, 'info', () => this.showInfo(ctx))
        })
    }

    @Hears(BOT_MENU.SUPPORT)
    async supportFromMenu(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'menu:support', async () => {
            await this.openNavigationSection(ctx, 'support', () => this.enterSupportMode(ctx))
        })
    }

    @Action(BOT_CALLBACK.START_TARIFFS)
    async startTariffsCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'tariffs', () => this.showTariffs(ctx))
    }

    @Action(BOT_CALLBACK.START_TRY_FREE)
    async startTryFreeCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'get_access', () => this.tryStartTrialFlow(ctx))
    }

    @Action(BOT_CALLBACK.START_HAS_SUBSCRIPTION)
    async startHasSubscriptionCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'my_subscription', () => this.handleMySubscription(ctx))
    }

    @Action(BOT_CALLBACK.START_NEW_USER)
    async startNewUserCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const provisioned = await this.provisionCurrentTelegramUser(ctx)
        await this.analyticsService.trackBotStart(provisioned.user.id, 'start:new_user')
        await this.prepareStartNavigation(ctx)
        const welcomeMessage = await this.startCommand.handle(ctx, provisioned.user)
        this.saveWelcomeMessage(ctx, (welcomeMessage as any)?.message_id)
        await this.replyWithTemporaryWebCredentials(ctx, provisioned.temporaryCredentials)
        await this.showMainMenu(ctx)
    }

    @Action(BOT_CALLBACK.START_LINK_SITE_ACCOUNT)
    async startLinkSiteAccountCallback(@Ctx() ctx: TelegrafContext) {
        await this.handleStartLinkSiteAccount(ctx)
    }

    @Action(BOT_CALLBACK.TELEGRAM_LINK_CONTINUE)
    async telegramLinkContinueCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const user = await this.ensureBotUser(ctx)
        await this.prepareStartNavigation(ctx)
        const welcomeMessage = await this.startCommand.handle(ctx, user)
        this.saveWelcomeMessage(ctx, (welcomeMessage as any)?.message_id)
        await this.showMainMenu(ctx)
    }

    @Action(BOT_CALLBACK.CHANNEL_CHECK)
    async channelCheckCallback(@Ctx() ctx: TelegrafContext) {
        if (!(await this.requireOfficialChannelMembership(ctx))) {
            await ctx.answerCbQuery()
            return
        }
        await ctx.answerCbQuery('✅ Подписка подтверждена')
        await this.showMainMenu(ctx)
    }

    @Action(BOT_CALLBACK.TARIFFS)
    async tariffsCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'tariffs', () => this.showTariffs(ctx), true)
    }

    @Action(BOT_CALLBACK.MY_SUBSCRIPTION)
    async mySubscriptionCallback(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'callback:my_subscription', async () => {
            await ctx.answerCbQuery()
            this.logger.log(`Bot callback my_subscription received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            await this.openNavigationSection(ctx, 'my_subscription', () => this.handleMySubscription(ctx))
        })
    }

    @Action(BOT_CALLBACK.GET_ACCESS)
    async getAccessCallback(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'callback:get_access', async () => {
            await ctx.answerCbQuery()
            this.logger.log(`Bot callback get_access received from ${ctx.from?.id || '-'}`, BotUpdate.name)
            await this.openNavigationSection(ctx, 'get_access', () => this.handleGetAccess(ctx))
        })
    }

    @Action(BOT_CALLBACK.GET_ACCESS_QR)
    async getAccessQrCallback(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'callback:get_access_qr', async () => {
            await ctx.answerCbQuery('Открываю QR-код')
            await this.openNavigationSection(ctx, 'get_access', () => this.handleGetAccessQr(ctx))
        })
    }

    @Action(BOT_CALLBACK.RENEW)
    async renewCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'renew', () => this.showRenew(ctx))
    }

    @Action(BOT_CALLBACK.AUTO_RENEW_ENABLE)
    async enableAutoRenewCallback(@Ctx() ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) {
            return
        }
        await ctx.answerCbQuery()
        await this.autoRenewService?.enable(user.id, PaymentMerchant.BOT)
        await this.openNavigationSection(ctx, 'my_subscription', () => this.handleMySubscription(ctx))
    }

    @Action(BOT_CALLBACK.AUTO_RENEW_DISABLE)
    async disableAutoRenewCallback(@Ctx() ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) {
            return
        }
        await ctx.answerCbQuery()
        await this.autoRenewService?.disable(user.id)
        await this.openNavigationSection(ctx, 'my_subscription', () => this.handleMySubscription(ctx))
    }

    @Action(BOT_CALLBACK.REFERRAL)
    async referralCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'referral', () => this.showReferral(ctx))
    }

    @Action(BOT_CALLBACK.WALLET)
    async walletCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'wallet', () => this.showWallet(ctx))
    }

    @Action(BOT_CALLBACK.FAQ)
    async faqCallback(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'callback:faq', async () => {
            await ctx.answerCbQuery()
            await this.openNavigationSection(ctx, 'faq', () => this.showFaq(ctx))
        })
    }

    @Action(BOT_CALLBACK.INFO)
    async infoCallback(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'callback:info', async () => {
            await ctx.answerCbQuery()
            await this.openNavigationSection(ctx, 'info', () => this.showInfo(ctx))
        })
    }

    @Action(BOT_CALLBACK.SUPPORT)
    async supportCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'support', () => this.enterSupportMode(ctx))
    }

    @Action(BOT_CALLBACK.BACK)
    async backCallback(@Ctx() ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, 'callback:back', async () => {
            await ctx.answerCbQuery()
            if (ctx.from) {
                this.promoAwaitingUsers.delete(String(ctx.from.id))
                this.adminBroadcastAwaitingUsers.delete(String(ctx.from.id))
                this.adminBroadcastDrafts.delete(String(ctx.from.id))
            }
            await this.showMainMenu(ctx)
        })
    }

    @Action(BOT_CALLBACK.START_TRIAL)
    async startTrialCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'get_access', () => this.tryStartTrialFlow(ctx))
    }

    @Action(/^buy_code:(.+)$/)
    async buyPlanByCodeCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const planCode = this.getCallbackPayload(ctx, BOT_CALLBACK.BUY_PLAN_BY_CODE_PREFIX)
        if (!planCode) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить тариф. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(ctx, 'renew', () => this.showPaymentOptionsForPlanCode(ctx, planCode))
    }

    @Action(/^buy_direct_code:(.+)$/)
    async buyPlanDirectByCodeCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const planCode = this.getCallbackPayload(ctx, BOT_CALLBACK.BUY_PLAN_DIRECT_BY_CODE_PREFIX)
        if (!planCode) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить тариф. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(ctx, 'renew', () => this.showPaymentOptionsForPlanCode(ctx, planCode))
    }

    @Action(/^pay_code:(.+)$/)
    async payPlanByCodeCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const planCode = this.getCallbackPayload(ctx, BOT_CALLBACK.PAY_PLAN_BY_CODE_PREFIX)
        if (!planCode) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить тариф. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(ctx, 'renew', async () => {
            await this.beginExternalCheckout(ctx, planCode)
        })
    }

    @Action(/^promo_code:(.+)$/)
    async promoPlanByCodeCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const planCode = this.getCallbackPayload(ctx, BOT_CALLBACK.PROMO_PLAN_BY_CODE_PREFIX)
        if (!planCode) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить тариф. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(ctx, 'renew', () => this.askPromoCodeForPlan(ctx, planCode))
    }

    @Action(/^pm:one:(.+)$/)
    async paymentMethodOneCallback(@Ctx() ctx: TelegrafContext) {
        await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) return
        await ctx.answerCbQuery()
        const token = this.getCallbackPayload(ctx, BOT_CALLBACK.PAYMENT_METHOD_ONE_PREFIX)
        if (token) await this.handleCheckoutMethod(ctx, token, 'ONE_TIME')
    }

    @Action(/^pm:crypto:(.+)$/)
    async paymentMethodCryptoCallback(@Ctx() ctx: TelegrafContext) {
        await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) return
        await ctx.answerCbQuery()
        const token = this.getCallbackPayload(ctx, BOT_CALLBACK.PAYMENT_METHOD_CRYPTO_PREFIX)
        if (token) await this.handleCheckoutMethod(ctx, token, 'CRYPTO')
    }

    @Action(/^pm:rec:review:(.+)$/)
    async paymentMethodRecurrentReviewCallback(@Ctx() ctx: TelegrafContext) {
        await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) return
        await ctx.answerCbQuery()
        const token = this.getCallbackPayload(ctx, BOT_CALLBACK.PAYMENT_METHOD_RECURRENT_REVIEW_PREFIX)
        if (token) await this.handleCheckoutMethod(ctx, token, 'RECURRENT')
    }

    @Action(/^pm:rec:confirm:(.+)$/)
    async paymentMethodRecurrentConfirmCallback(@Ctx() ctx: TelegrafContext) {
        await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) return
        await ctx.answerCbQuery()
        const token = this.getCallbackPayload(ctx, BOT_CALLBACK.PAYMENT_METHOD_RECURRENT_CONFIRM_PREFIX)
        if (token) await this.handleCheckoutMethod(ctx, token, 'RECURRENT')
    }

    @Action(/^pm:back:(.+)$/)
    async paymentMethodBackCallback(@Ctx() ctx: TelegrafContext) {
        await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) return
        await ctx.answerCbQuery()
        const token = this.getCallbackPayload(ctx, BOT_CALLBACK.PAYMENT_METHOD_BACK_PREFIX)
        if (token) await this.handleCheckoutBack(ctx, token)
    }

    @Action(/^bonus_buy_code:(.+)$/)
    async payPlanWithBonusByCodeCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const planCode = this.getCallbackPayload(ctx, BOT_CALLBACK.PAY_BONUS_PLAN_BY_CODE_PREFIX)
        if (!planCode) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить тариф. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(ctx, 'renew', () => this.payPlanWithBonus(ctx, planCode))
    }

    @Action(/^tariff_period:(.+)$/)
    async tariffPeriodCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const payload = this.getCallbackPayload(ctx, BOT_CALLBACK.TARIFF_PERIOD_PREFIX)
        const period = Number(payload)
        if (!period) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить период. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(ctx, 'tariffs', () => this.showTariffDevices(ctx, period), true)
    }

    @Action(/^tariff_device:(.+)$/)
    async tariffDeviceCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const payload = this.getCallbackPayload(ctx, BOT_CALLBACK.TARIFF_DEVICE_PREFIX)
        const [periodValue, devicesValue] = String(payload || '').split(':')
        const period = Number(periodValue)
        const devicesLimit = Number(devicesValue)
        if (!period || !devicesLimit) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить выбор. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(ctx, 'tariffs', () => this.showTariffDevices(ctx, period, devicesLimit), true)
    }

    @Action(/^tariff_continue:(.+)$/)
    async tariffContinueCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const payload = this.getCallbackPayload(ctx, BOT_CALLBACK.TARIFF_CONTINUE_PREFIX)
        const [periodValue, devicesValue] = String(payload || '').split(':')
        const period = Number(periodValue)
        const devicesLimit = Number(devicesValue)
        if (!period || !devicesLimit) {
            await this.replyStyled(ctx, 'SUBSCRIPTION_TARIFF', 'Не удалось определить выбор. Попробуйте ещё раз.')
            return
        }

        await this.openNavigationSection(
            ctx,
            'renew',
            () => this.showPaymentOptionsForSelection(ctx, period, devicesLimit),
            true,
        )
    }

    @Action(BOT_CALLBACK.RENEW_NOW)
    async renewNowCallback(@Ctx() ctx: TelegrafContext) {
        await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) {
            return
        }
        await this.handleRenewNow(ctx)
    }

    @Action(BOT_CALLBACK.RENEW_WITH_BONUS)
    async renewWithBonusCallback(@Ctx() ctx: TelegrafContext) {
        await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) {
            return
        }
        await this.handleRenewWithBonus(ctx)
    }

    @Action(BOT_CALLBACK.CHECK_PAYMENT)
    async checkPaymentCallback(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'renew', () => this.handleCheckPayment(ctx))
    }

    @Action(BOT_CALLBACK.SUPPORT_BEGIN)
    async supportBegin(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.openNavigationSection(ctx, 'support', () => this.enterSupportMode(ctx))
    }

    @Action(BOT_CALLBACK.SUPPORT_CANCEL)
    async supportCancel(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.clearNavigationMessages(ctx, false, this.getCallbackMessageId(ctx))
        if (!ctx.from) {
            return
        }
        await this.replyStyled(ctx, 'MENU_BUTTON_SUPPORT', 'Режим обращения в поддержку отменён.')
    }

    @Action(BOT_CALLBACK.SUPPORT_ADMIN_REPLY_CANCEL)
    async supportAdminReplyCancel(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()

        if (!ctx.from || !this.isAdminTelegramUser(ctx.from.id)) {
            return
        }

        await ctx.reply('Ответ отменён. Чтобы начать снова, нажмите «✍️ Ответить» у нужного обращения.')
    }

    @Action(new RegExp(`^${BOT_CALLBACK.SUPPORT_ADMIN_REPLY_PREFIX}(${SUPPORT_THREAD_UUID_PATTERN})$`, 'i'))
    async supportAdminReplyStart(@Ctx() ctx: TelegrafContext) {
        await this.handleSupportAdminReplyStart(ctx)
    }

    @Action(new RegExp(`^${BOT_CALLBACK.SUPPORT_ADMIN_RETRY_PREFIX}(${SUPPORT_THREAD_UUID_PATTERN})$`, 'i'))
    async supportAdminRetry(@Ctx() ctx: TelegrafContext) {
        const messageId = this.getCallbackPayload(ctx, BOT_CALLBACK.SUPPORT_ADMIN_RETRY_PREFIX)
        if (!ctx.from || !messageId || !isUUID(messageId) || !this.isAdminTelegramUser(ctx.from.id) || !this.isSupportChat(ctx.chat?.id)) {
            await ctx.answerCbQuery('Действие недоступно.', { show_alert: true } as any)
            return
        }
        await ctx.answerCbQuery()
        await this.retryAdminSupportDelivery(ctx, messageId)
    }

    @Action(BOT_CALLBACK.ADMIN_BROADCAST_SEND)
    async adminBroadcastSend(@Ctx() ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.sendAdminBroadcast(ctx)
    }

    @Action(BOT_CALLBACK.ADMIN_BROADCAST_CANCEL)
    async adminBroadcastCancel(@Ctx() ctx: TelegrafContext) {
        await this.handleAdminBroadcastCancel(ctx)
    }

    @On('text')
    async onSupportText(@Ctx() ctx: TelegrafContext) {
        await this.handleSupportText(ctx)
    }

    @On('photo')
    async onBroadcastPhoto(@Ctx() ctx: TelegrafContext) {
        if (await this.handleSupportPhoto(ctx)) return
        await this.handleAdminBroadcastMediaDraft(ctx)
    }

    @On('video')
    async onBroadcastVideo(@Ctx() ctx: TelegrafContext) {
        if (await this.handleUnsupportedSupportMedia(ctx)) return
        await this.handleAdminBroadcastMediaDraft(ctx)
    }

    @On('document')
    async onBroadcastDocument(@Ctx() ctx: TelegrafContext) {
        if (await this.handleUnsupportedSupportMedia(ctx)) return
        await this.handleAdminBroadcastMediaDraft(ctx)
    }

    @On('animation')
    async onBroadcastAnimation(@Ctx() ctx: TelegrafContext) {
        if (await this.handleUnsupportedSupportMedia(ctx)) return
        await this.handleAdminBroadcastMediaDraft(ctx)
    }

    @On('sticker')
    async onSupportReplySticker(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('voice')
    async onSupportReplyVoice(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('audio')
    async onSupportReplyAudio(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('video_note')
    async onSupportReplyVideoNote(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('contact')
    async onSupportReplyContact(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('dice')
    async onSupportReplyDice(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('location')
    async onSupportReplyLocation(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('poll')
    async onSupportReplyPoll(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('venue')
    async onSupportReplyVenue(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }

    @On('story')
    async onSupportReplyStory(@Ctx() ctx: TelegrafContext) {
        await this.handleUnsupportedSupportMedia(ctx)
    }
}
