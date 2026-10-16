import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { BOT_CALLBACK, BOT_INLINE_LABEL } from '../bot.constants'
import { tgEmoji } from '../custom-emoji.registry'
import { BotSubscriptionFlow } from './subscription.flow'

export abstract class BotReferralFlow extends BotSubscriptionFlow {
    protected async showReferral(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        const botName = (await this.bot.telegram.getMe()).username
        const stats = await this.referralService.getReferralStats(user.id)
        const code = stats.referralCode || user.referralCode || 'ref_code_missing'
        const botLink = botName ? `https://t.me/${botName}?start=${code}` : null
        const websiteOrigin = String(this.configService.get<string>('FRONTEND_ORIGIN') || '')
            .trim()
            .replace(/\/+$/, '')
        const websiteLink = websiteOrigin ? `${websiteOrigin}/?ref=${encodeURIComponent(code)}` : null

        const safeBotLink = this.escapeHtml(botLink || 'Ссылка временно недоступна, напишите в поддержку.')
        const safeWebsiteLink = this.escapeHtml(websiteLink || 'Сайт временно недоступен, напишите в поддержку.')
        const shareText = [
            'Я пользуюсь NOS VPN.',
            'Там можно быстро подключить VPN через сайт, а потом при желании привязать Telegram.',
            websiteLink
                ? `Если у тебя не открывается Telegram, просто открой сайт по моей ссылке: ${websiteLink}`
                : 'Если у тебя не открывается Telegram, просто открой сайт по моей ссылке.',
            botLink ? `Если Telegram работает, можно просто открыть бота: ${botLink}` : null,
        ]
            .filter(Boolean)
            .join('\n')

        await ctx.reply(
            [
                `${tgEmoji('REFERRAL_TITLE')} Приглашайте друзей`,
                `${tgEmoji('REFERRAL_ARROW')} <i>Ссылка на сайт:</i> ${safeWebsiteLink}`,
                `${tgEmoji('REFERRAL_ARROW')} <i>Ссылка на бота:</i> ${safeBotLink}`,
                `${tgEmoji('REFERRAL_ARROW')} <i>Как это работает:</i>\n<blockquote>${tgEmoji('REFERRAL_INSTRUCTION_BULLET')} Если у друга не работает Telegram — отправьте ссылку на сайт.\n\n${tgEmoji('REFERRAL_INSTRUCTION_BULLET')} Если Telegram работает — можно отправить ссылку на бота.\n\n${tgEmoji('REFERRAL_INSTRUCTION_BULLET')} Сайт и бот привяжут пользователя к вам автоматически, отдельный промокод для рефералки не нужен.\n\n${tgEmoji('REFERRAL_INSTRUCTION_BULLET')} После успешной оплаты вам начисляются бонусные рубли в кошелёк.\n\n${tgEmoji('REFERRAL_INSTRUCTION_BULLET')} Кошелёк можно использовать для полной оплаты тарифа, а когда накопите нужную сумму — обратиться в поддержку для вывода на карту.</blockquote>`,
                `${tgEmoji('REFERRAL_ARROW')} <i>Готовый текст для друга:</i>\n<pre>${this.escapeHtml(shareText)}</pre>`,
            ].join('\n\n'),
            this.htmlReplyOptions(
                Markup.inlineKeyboard([[Markup.button.callback(BOT_INLINE_LABEL.WALLET, BOT_CALLBACK.WALLET)]]) as any,
            ) as any,
        )
    }

    protected async showWallet(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        const stats = await this.referralService.getReferralStats(user.id)

        await ctx.reply(
            [
                `${tgEmoji('WALLET_TITLE')} <b>Кошелек</b>`,
                `Баланс: ${this.escapeHtml(`${this.formatMoney(stats.bonusBalanceRub)} ₽`)}`,
                `Всего начислено: ${this.escapeHtml(`${this.formatMoney(stats.totalBonusRub)} ₽`)}`,
                `Приглашено пользователей: ${stats.invitedCount}`,
                `Оплатили подписку: ${stats.invitedPaidCount}`,
                `С активным доступом: ${stats.activeInvitedCount}`,
                `${tgEmoji('WALLET_BONUS')} Бонус по рефералке: 50% с каждой успешной оплаты приглашённого пользователя.`,
                `${tgEmoji('WALLET_AUTO_RENEW')} Если после окончания подписки и дополнительных 24 часов на балансе хватает денег на тот же тариф, продление произойдет автоматически.`,
            ].join('\n\n'),
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [Markup.button.callback(BOT_INLINE_LABEL.REFERRAL, BOT_CALLBACK.REFERRAL)],
                    [Markup.button.callback(BOT_INLINE_LABEL.TARIFFS, BOT_CALLBACK.TARIFFS)],
                ]) as any,
            ) as any,
        )
    }
}
