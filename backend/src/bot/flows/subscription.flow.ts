import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { buildSubscriptionButtons, buildSubscriptionMessage } from '../bot-subscription-message'
import { BOT_CALLBACK } from '../bot.constants'
import { BotAccessFlow } from './access.flow'

export abstract class BotSubscriptionFlow extends BotAccessFlow {
    protected async handleMySubscription(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        const sub = await this.subscriptionService.getResolvedForUser(user.id)
        if (!sub) {
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_MY_SUBSCRIPTION',
                    'У вас пока нет активной подписки. Выберите тариф и подключитесь за пару минут.',
                ),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_TARIFFS', 'Выбрать тариф'),
                                BOT_CALLBACK.TARIFFS,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
            return
        }

        const presentation = this.getSubscriptionPresentation(sub)
        const autoRenew = this.autoRenewService
            ? await this.autoRenewService.get(user.id)
            : { enabled: false, nextPaymentAt: null, method: null }
        const maskedMethod = autoRenew.method
            ? `${autoRenew.method.title || autoRenew.method.type || 'способ оплаты'}${
                  autoRenew.method.last4 ? ` •••• ${autoRenew.method.last4}` : ''
              }`
            : null
        const message = buildSubscriptionMessage({
            statusText: presentation.statusText,
            tariffText: sub.plan?.title || sub.plan?.name || '-',
            expiresAtLabel: presentation.expiresAtLabel,
            expiresAtText: presentation.expiresAtText,
            trialText: user.hasUsedTrial ? 'уже использован' : 'ещё доступен',
            autoRenewText: autoRenew.enabled ? 'включено' : 'выключено',
            nextPaymentText: autoRenew.nextPaymentAt ? new Date(autoRenew.nextPaymentAt).toLocaleString('ru-RU') : null,
            paymentMethodText: maskedMethod,
        })

        await ctx.reply(message, {
            ...Markup.inlineKeyboard(buildSubscriptionButtons(autoRenew.enabled, Boolean(autoRenew.method))),
            parse_mode: 'HTML',
        } as any)
    }
}
