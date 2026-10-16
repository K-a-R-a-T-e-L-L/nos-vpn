import { Markup } from 'telegraf'

import { BOT_AUTO_RENEW_LABEL, BOT_CALLBACK, BOT_SUBSCRIPTION_LABEL } from './bot.constants'
import { tgEmoji } from './custom-emoji.registry'

export type SubscriptionMessageInput = {
    statusText: string
    tariffText: string
    expiresAtLabel: string
    expiresAtText: string
    trialText: string
    autoRenewText?: string
    nextPaymentText?: string | null
    paymentMethodText?: string | null
}

export function buildSubscriptionMessage(input: SubscriptionMessageInput) {
    return [
        `${tgEmoji('SUBSCRIPTION_TITLE')} <b>Моя подписка</b>`,
        '',
        `${tgEmoji('SUBSCRIPTION_STATUS')} Статус: ${escapeHtml(input.statusText)}`,
        `${tgEmoji('SUBSCRIPTION_TARIFF')} Тариф: ${escapeHtml(input.tariffText)}`,
        `${tgEmoji('SUBSCRIPTION_EXPIRES_AT')} ${escapeHtml(input.expiresAtLabel)}: ${escapeHtml(input.expiresAtText)}`,
        `${tgEmoji('SUBSCRIPTION_TRIAL')} Бесплатный старт: ${escapeHtml(input.trialText)}`,
        `Автопродление: ${escapeHtml(input.autoRenewText || 'выключено')}`,
        input.nextPaymentText ? `Следующий платёж: ${escapeHtml(input.nextPaymentText)}` : null,
        input.paymentMethodText ? `Способ оплаты: ${escapeHtml(input.paymentMethodText)}` : null,
    ].filter(Boolean).join('\n')
}

export function buildSubscriptionButtons(autoRenewEnabled = false, autoRenewAvailable = false) {
    return [
        [Markup.button.callback(BOT_SUBSCRIPTION_LABEL.GET_LINK, BOT_CALLBACK.GET_ACCESS)],
        [Markup.button.callback(BOT_SUBSCRIPTION_LABEL.RENEW, BOT_CALLBACK.RENEW)],
        [Markup.button.callback(BOT_SUBSCRIPTION_LABEL.CHOOSE_OTHER_TARIFF, BOT_CALLBACK.TARIFFS)],
        ...(autoRenewEnabled
            ? [[Markup.button.callback(BOT_AUTO_RENEW_LABEL.DISABLE, BOT_CALLBACK.AUTO_RENEW_DISABLE)]]
            : autoRenewAvailable
              ? [[Markup.button.callback(BOT_AUTO_RENEW_LABEL.ENABLE, BOT_CALLBACK.AUTO_RENEW_ENABLE)]]
              : []),
        ...(autoRenewEnabled || autoRenewAvailable
            ? [[Markup.button.callback(BOT_AUTO_RENEW_LABEL.MANUAL, BOT_CALLBACK.RENEW)]]
            : []),
        [Markup.button.callback(BOT_SUBSCRIPTION_LABEL.SUPPORT, BOT_CALLBACK.SUPPORT)],
    ]
}

function escapeHtml(value: string) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
