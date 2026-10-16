import { tgEmoji } from './custom-emoji.registry'

export function buildWelcomeMessage() {
    const siteUrl = process.env.FRONTEND_ORIGIN?.trim()

    return [
        `${tgEmoji('WELCOME_TITLE_ROCKET')} <b>Добро пожаловать в NOS VPN.</b>`,
        '',
        `${tgEmoji('WELCOME_CONNECTION')} Подключение здесь занимает всего пару минут:`,
        'откройте «Тарифы», выберите вариант и получите ссылку доступа.',
        '',
        `${tgEmoji('WELCOME_SIMPLE')} Дальше всё просто — на странице подписки будут инструкция, клиенты и быстрый старт для подключения.`,
        '',
        siteUrl ? `${tgEmoji('INFO_TITLE')} Web NOS VPN: ${siteUrl}` : null,
        siteUrl
            ? 'Даже если не работает телеграм, сайт NOS VPN позволит вам управлять подпиской, профилем и многим другим.'
            : null,
        siteUrl ? '' : null,
        `${tgEmoji('WELCOME_HELP')} Если что-то пойдёт не так, актуальная информация всегда здесь.`,
    ]
        .filter((part) => part !== null)
        .join('\n')
}

export function buildPlainWelcomeMessage() {
    const siteUrl = process.env.FRONTEND_ORIGIN?.trim()

    return [
        '🚀 Добро пожаловать в NOS VPN.',
        '',
        '🟢 Подключение здесь занимает всего пару минут:',
        'откройте «Тарифы», выберите вариант и получите ссылку доступа.',
        '',
        '💗 Дальше всё просто — на странице подписки будут инструкция, клиенты и быстрый старт для подключения.',
        '',
        siteUrl ? `🌐 Web NOS VPN: ${siteUrl}` : null,
        siteUrl
            ? 'Даже если не работает телеграм, сайт NOS VPN позволит вам управлять подпиской, профилем и многим другим.'
            : null,
        siteUrl ? '' : null,
        '💎 Если что-то пойдёт не так, актуальная информация всегда здесь.',
    ]
        .filter((part) => part !== null)
        .join('\n')
}
