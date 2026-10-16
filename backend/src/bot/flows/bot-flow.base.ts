import { ConfigService } from '@nestjs/config'
import { Telegraf } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { AnalyticsService } from '../../analytics/services/analytics.service'
import { TelegramLoggerService } from '../../logger/logger.service'
import { PaymentCheckoutOptionsService } from '../../payment/services/payment-checkout-options.service'
import { PaymentService } from '../../payment/services/payment.service'
import { PlategaRecurrentAgreementService } from '../../payment/services/platega-recurrent-agreement.service'
import { PlanService } from '../../plan/services/plan.service'
import { ReferralService } from '../../referral/services/referral.service'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { SubscriptionAutoRenewService } from '../../subscription/services/subscription-auto-renew.service'
import { SubscriptionService } from '../../subscription/services/subscription.service'
import type { SupportPhotoAttachment } from '../../support/entity/support-message.entity'
import { SupportService } from '../../support/services/support.service'
import { UserService } from '../../system/user/services/user.service'
import { TELEGRAM_DESTINATION, isTelegramDestination } from '../../telegram/telegram-destination'
import { AccessPresentationService } from '../../vpn-access/services/access-presentation.service'
import { BotNavigationService } from '../bot-navigation.service'
import { BOT_MENU } from '../bot.constants'
import { StartCommand } from '../commands/start.command'
import { CUSTOM_EMOJI, CustomEmojiKey, tgEmoji } from '../custom-emoji.registry'
import { BotCheckoutState } from '../payment/bot-checkout-state'
import { extractSupportThreadIdFromReplyPrompt, isCustomerSupportReplyPrompt } from '../support-admin-reply'
export abstract class BotFlowBase {
    protected readonly promoAwaitingUsers = new Map<string, string>()
    protected readonly adminBroadcastAwaitingUsers = new Set<string>()
    protected readonly adminBroadcastDrafts = new Map<
        string,
        { sourceChatId: string | number; sourceMessageId: number }
    >()
    protected readonly checkoutState = new BotCheckoutState()

    protected constructor(
        protected readonly userService: UserService,
        protected readonly logger: TelegramLoggerService,
        protected readonly startCommand: StartCommand,
        protected readonly subscriptionService: SubscriptionService,
        protected readonly accessPresentationService: AccessPresentationService,
        protected readonly planService: PlanService,
        protected readonly referralService: ReferralService,
        protected readonly paymentService: PaymentService,
        protected readonly checkoutOptionsService: PaymentCheckoutOptionsService,
        protected readonly recurrentAgreementService: PlategaRecurrentAgreementService,
        protected readonly supportService: SupportService,
        protected readonly configService: ConfigService,
        protected readonly navigationService: BotNavigationService,
        protected readonly analyticsService: AnalyticsService,
        protected readonly bot: Telegraf,
        protected readonly autoRenewService?: SubscriptionAutoRenewService,
    ) {}

    protected getCallbackPayload(ctx: TelegrafContext, prefix: string) {
        const data = (ctx.callbackQuery as any)?.data as string
        if (!data || !data.startsWith(prefix)) {
            return null
        }
        return data.slice(prefix.length)
    }

    protected getErrorText(error: any) {
        const response = typeof error?.getResponse === 'function' ? error.getResponse() : null
        return JSON.stringify({
            message: error?.message,
            response,
        })
    }

    protected isPaymentConfigured() {
        const returnUrl = String(this.configService.get<string>('PAYMENT_RETURN_URL') || '').trim()
        const merchantId = String(this.configService.get<string>('PLATEGA_MERCHANT_ID') || '').trim()
        const secret = String(this.configService.get<string>('PLATEGA_SECRET') || '').trim()
        return Boolean(returnUrl && merchantId && secret && merchantId !== 'change_me' && secret !== 'change_me')
    }

    protected isCustomEmojiDebugEnabled() {
        return String(this.configService.get<string>('TELEGRAM_CUSTOM_EMOJI_DEBUG') || '').toLowerCase() === 'true'
    }

    protected isBotNavigationText(text?: string | null) {
        if (!text) {
            return false
        }

        if (text.startsWith('/')) {
            return true
        }

        return Object.values(BOT_MENU).includes(text as any)
    }

    protected isAdminTelegramUser(telegramId?: number | string | null) {
        if (!telegramId) {
            return false
        }

        return String(this.configService.get<string>('TELEGRAM_ADMIN_IDS') || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .includes(String(telegramId))
    }

    protected isSupportChat(chatId?: number | string | null) {
        return isTelegramDestination(this.configService, TELEGRAM_DESTINATION.SUPPORT, chatId)
    }

    protected getStatelessAdminSupportReplyThreadId(ctx: TelegrafContext): string | null {
        const from = ctx.from
        if (!from || !this.isAdminTelegramUser(from.id) || !this.isSupportChat(ctx.chat?.id)) return null
        const replyToMessage: any = (ctx.message as any)?.reply_to_message
        const botId = (ctx as any).botInfo?.id ?? (this.bot as any).botInfo?.id
        if (!botId || String(replyToMessage?.from?.id || '') !== String(botId)) return null
        return extractSupportThreadIdFromReplyPrompt(replyToMessage?.text)
    }

    protected isStatelessCustomerSupportReply(ctx: TelegrafContext): boolean {
        const from = ctx.from
        if (!from) return false
        const replyToMessage: any = (ctx.message as any)?.reply_to_message
        const botId = (ctx as any).botInfo?.id ?? (this.bot as any).botInfo?.id
        if (!botId || String(replyToMessage?.from?.id || '') !== String(botId)) return false
        return isCustomerSupportReplyPrompt(replyToMessage?.text)
    }

    protected getTelegramPhotoAttachment(ctx: TelegrafContext): SupportPhotoAttachment | null {
        const photos = (ctx.message as any)?.photo
        if (!Array.isArray(photos) || !photos.length) return null
        const selected = photos.reduce((largest: any, candidate: any) => {
            const largestPixels = Number(largest?.width || 0) * Number(largest?.height || 0)
            const candidatePixels = Number(candidate?.width || 0) * Number(candidate?.height || 0)
            if (candidatePixels !== largestPixels) return candidatePixels > largestPixels ? candidate : largest
            return Number(candidate?.file_size || 0) > Number(largest?.file_size || 0) ? candidate : largest
        })
        const telegramFileId = String(selected?.file_id || '').trim()
        if (!telegramFileId) return null
        return {
            telegramFileId,
            telegramFileUniqueId: String(selected?.file_unique_id || '').trim() || null,
            width: Number.isFinite(Number(selected?.width)) ? Number(selected.width) : null,
            height: Number.isFinite(Number(selected?.height)) ? Number(selected.height) : null,
            fileSize: Number.isFinite(Number(selected?.file_size)) ? Number(selected.file_size) : null,
        }
    }

    protected getTelegramMessageSource(ctx: TelegrafContext) {
        const chatId = (ctx.message as any)?.chat?.id ?? ctx.chat?.id
        const messageId = (ctx.message as any)?.message_id
        if (chatId === undefined || chatId === null || messageId === undefined || messageId === null) {
            return { sourceTelegramChatId: null, sourceTelegramMessageId: null }
        }
        return {
            sourceTelegramChatId: String(chatId),
            sourceTelegramMessageId: String(messageId),
        }
    }

    protected isTelegramMediaGroup(ctx: TelegrafContext) {
        return Boolean((ctx.message as any)?.media_group_id)
    }

    protected async handleUnsupportedSupportMedia(ctx: TelegrafContext): Promise<boolean> {
        if (this.getStatelessAdminSupportReplyThreadId(ctx)) {
            await ctx.reply('Сейчас в поддержке можно отправить только текст или одну фотографию с необязательной подписью.')
            return true
        }
        if (!this.isStatelessCustomerSupportReply(ctx)) return false
        if ((ctx.message as any)?.document) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Сейчас поддерживаются только фотографии. Отправьте фото как изображение, а не как документ.',
            )
        } else {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Сейчас можно отправить только текст или одну фотографию с необязательной подписью.',
            )
        }
        return true
    }

    protected async withReplyTracing<T>(ctx: TelegrafContext, label: string, handler: () => Promise<T>): Promise<T> {
        const originalReply = ctx.reply.bind(ctx)
        const originalAnswerCbQuery = typeof ctx.answerCbQuery === 'function' ? ctx.answerCbQuery.bind(ctx) : null

        ;(ctx as any).reply = (...args: any[]) =>
            this.tracedTelegramCall(`${label}:reply`, () => originalReply(...args))

        if (originalAnswerCbQuery) {
            ;(ctx as any).answerCbQuery = (...args: any[]) =>
                this.tracedTelegramCall(`${label}:answerCbQuery`, () => originalAnswerCbQuery(...args))
        }

        this.logger.log(`TRACE ENTER ${label}`, 'BotUpdate')
        try {
            const result = await handler()
            this.logger.log(`TRACE EXIT ${label}`, 'BotUpdate')
            return result
        } catch (error: any) {
            this.logger.error(
                `TRACE ERROR ${label}: ${error?.message || 'unknown'}; stack=${error?.stack || 'n/a'}`,
                'BotUpdate',
            )
            throw error
        } finally {
            ;(ctx as any).reply = originalReply
            if (originalAnswerCbQuery) {
                ;(ctx as any).answerCbQuery = originalAnswerCbQuery
            }
        }
    }

    protected async tracedTelegramCall<T>(label: string, call: () => Promise<T>): Promise<T> {
        const timeoutMs = 10000
        this.logger.log(`TRACE BEFORE ${label}`, 'BotUpdate')

        let timeoutHandle: NodeJS.Timeout | null = null
        const timeout = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`Telegram API call timeout after ${timeoutMs}ms`))
            }, timeoutMs)
        })

        try {
            const result = await Promise.race([call(), timeout])
            if (timeoutHandle) {
                clearTimeout(timeoutHandle)
            }
            const messageId = (result as any)?.message_id || '-'
            this.logger.log(`TRACE AFTER ${label}; messageId=${messageId}`, 'BotUpdate')
            return result as T
        } catch (error: any) {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle)
            }
            this.logger.error(
                `TRACE ERROR ${label}: ${error?.message || 'unknown'}; stack=${error?.stack || 'n/a'}`,
                'BotUpdate',
            )
            throw error
        }
    }

    protected formatSubscriptionStatus(status: StatusesEnum | string) {
        const map: Record<string, string> = {
            [StatusesEnum.PENDING]: 'доступ готовится',
            [StatusesEnum.ACTIVE]: 'доступ активен',
            [StatusesEnum.GRACE]: 'подписка закончилась, но доступ ещё активен',
            [StatusesEnum.STOPPED]: 'доступ остановлен',
            [StatusesEnum.EXPIRED]: 'подписка истекла',
        }

        return map[String(status)] || String(status)
    }

    protected getSubscriptionPresentation(subscription: {
        status: StatusesEnum | string
        endsAt?: Date | string | null
        graceEndsAt?: Date | string | null
        accessDisabledAt?: Date | string | null
    }) {
        const now = new Date()
        const endsAt = subscription.endsAt ? new Date(subscription.endsAt) : null
        const graceEndsAt = subscription.graceEndsAt ? new Date(subscription.graceEndsAt) : null
        const accessDisabledAt = subscription.accessDisabledAt ? new Date(subscription.accessDisabledAt) : null

        if (subscription.status === StatusesEnum.GRACE && graceEndsAt) {
            return {
                statusText: 'подписка истекла, но доступ ещё активен 24 часа',
                expiresAtLabel: 'Доступен до',
                expiresAtText: this.formatDate(graceEndsAt),
            }
        }

        if (subscription.status === StatusesEnum.EXPIRED) {
            if (accessDisabledAt) {
                const diffDays = Math.floor((now.getTime() - accessDisabledAt.getTime()) / (24 * 60 * 60 * 1000))
                const suffix = diffDays <= 0 ? 'сегодня' : `${diffDays} дн. назад`
                return {
                    statusText: `подписка истекла, доступ отключен ${suffix}`,
                    expiresAtLabel: 'Истекла',
                    expiresAtText: this.formatDate(accessDisabledAt),
                }
            }

            return {
                statusText: 'подписка истекла',
                expiresAtLabel: 'Истекла',
                expiresAtText: this.formatDate(endsAt),
            }
        }

        return {
            statusText: this.formatSubscriptionStatus(subscription.status),
            expiresAtLabel: 'Действует до',
            expiresAtText: this.formatDate(endsAt),
        }
    }

    protected formatDate(value?: Date | string | null) {
        if (!value) {
            return '-'
        }

        return new Date(value).toLocaleString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Moscow',
        })
    }

    protected formatMoney(value: number) {
        return Number(value || 0).toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })
    }

    protected styledText(key: CustomEmojiKey, text: string) {
        return `${tgEmoji(key)} ${text}`
    }

    protected buttonLabel(key: CustomEmojiKey, text: string) {
        return `${CUSTOM_EMOJI[key].fallback} ${text}`
    }

    protected htmlReplyOptions(extra: Record<string, any> = {}) {
        return {
            ...extra,
            parse_mode: 'HTML' as const,
        }
    }

    protected replyStyled(ctx: TelegrafContext, key: CustomEmojiKey, text: string, extra: Record<string, any> = {}) {
        return ctx.reply(this.styledText(key, text), this.htmlReplyOptions(extra) as any)
    }

    protected escapeHtml(value: string) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }

    protected async ensureBotUser(ctx: TelegrafContext) {
        const from = ctx.from
        if (!from) {
            throw new Error('Telegram user context is missing')
        }

        return this.userService.ensureTelegramUser({
            id: from.id,
            username: from.username,
            first_name: from.first_name,
            last_name: from.last_name,
            is_premium: (from as any).is_premium,
            language_code: from.language_code,
        })
    }

    protected getStartPayload(ctx: TelegrafContext) {
        const startPayload = (ctx as any).startPayload
        if (startPayload) {
            return String(startPayload).trim()
        }

        const text = (ctx.message as any)?.text || ''
        const parts = String(text).trim().split(/\s+/)
        return parts.length >= 2 ? parts[1] : ''
    }

    protected getTariffListEmojiKey(planCode?: string | null): CustomEmojiKey {
        const devicesLimit = Number(
            String(planCode || '')
                .split('_')
                .pop() || 0,
        )
        if (devicesLimit === 1) return 'TARIFF_PLAN_1'
        if (devicesLimit === 2) return 'TARIFF_PLAN_2'
        if (devicesLimit >= 3) return 'TARIFF_PLAN_3'
        return 'SUBSCRIPTION_TARIFF'
    }
}
