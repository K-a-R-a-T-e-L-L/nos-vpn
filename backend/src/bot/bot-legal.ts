import { Markup } from 'telegraf'

import { BOT_OFFICIAL_CHANNEL } from './bot.constants'

export const BOT_LEGAL_DETAILS = {
    operator: 'Администрация сервиса NOS VPN',
    website: 'https://vpn.example.invalid',
    telegramBot: 'https://t.me/your_vpn_bot',
    telegramSupportUsername: '@your_support_username',
    telegramSupportUrl: 'https://t.me/your_support_username',
    effectiveDate: '10 сентября 2026 года',
    version: '2.1',
} as const

export const BOT_LEGAL_URLS = {
    terms: `${BOT_LEGAL_DETAILS.website}/terms`,
    privacy: `${BOT_LEGAL_DETAILS.website}/privacy`,
    refund: `${BOT_LEGAL_DETAILS.website}/refund`,
    contacts: `${BOT_LEGAL_DETAILS.website}/contacts`,
} as const

export function buildBotLegalButtonRows() {
    return [
        [
            Markup.button.url('Условия', BOT_LEGAL_URLS.terms),
            Markup.button.url('Конфиденциальность', BOT_LEGAL_URLS.privacy),
        ],
        [Markup.button.url('Возвраты', BOT_LEGAL_URLS.refund), Markup.button.url('Контакты', BOT_LEGAL_URLS.contacts)],
        [Markup.button.url('📣 Канал NOS VPN', BOT_OFFICIAL_CHANNEL.url)],
    ]
}

export function buildBotPrePaymentLegalButtonRows() {
    return [
        [
            Markup.button.url('Условия', BOT_LEGAL_URLS.terms),
            Markup.button.url('Конфиденциальность', BOT_LEGAL_URLS.privacy),
        ],
        [Markup.button.url('Возвраты', BOT_LEGAL_URLS.refund)],
    ]
}

export function buildBotLegalInfoText() {
    return [
        '<b>Информация о сервисе</b>',
        `<i>Оператор:</i>\n${BOT_LEGAL_DETAILS.operator}`,
        `<i>Сайт NOS VPN:</i>\n${BOT_LEGAL_DETAILS.website}`,
        `<i>Telegram-бот:</i>\n${BOT_LEGAL_DETAILS.telegramBot}`,
        `<i>Канал NOS VPN:</i>\n${BOT_OFFICIAL_CHANNEL.username}`,
        `<i>Поддержка в Telegram:</i>\n${BOT_LEGAL_DETAILS.telegramSupportUsername}`,
        'Документы доступны по кнопкам ниже. По вопросам подписки, оплаты, возврата или отмены будущих списаний напишите в поддержку.',
    ]
        .filter(Boolean)
        .join('\n\n')
}
