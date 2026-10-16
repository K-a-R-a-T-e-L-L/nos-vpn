type ConfigReader = {
    get(key: string): unknown
}

export const TELEGRAM_DESTINATION = {
    SUPPORT: 'TELEGRAM_SUPPORT_CHAT_ID',
    LOGS: 'TELEGRAM_LOGS_CHAT_ID',
} as const

function normalizeChatId(value: unknown): string {
    const normalized = String(value || '').trim()
    return /^-?\d+$/.test(normalized) ? normalized : ''
}

export function resolveTelegramDestination(
    config: ConfigReader,
    destination: (typeof TELEGRAM_DESTINATION)[keyof typeof TELEGRAM_DESTINATION],
): string {
    const explicit = normalizeChatId(config.get(destination))
    if (explicit) return explicit
    if (process.env.NODE_ENV === 'production') return ''
    return normalizeChatId(config.get('TELEGRAM_ADMINCHAT_ID'))
}

export function isTelegramDestination(
    config: ConfigReader,
    destination: (typeof TELEGRAM_DESTINATION)[keyof typeof TELEGRAM_DESTINATION],
    chatId?: string | number | null,
): boolean {
    const expected = resolveTelegramDestination(config, destination)
    return Boolean(expected && String(chatId ?? '').trim() === expected)
}
