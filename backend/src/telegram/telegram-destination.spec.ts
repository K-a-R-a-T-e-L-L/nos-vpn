import { TELEGRAM_DESTINATION, isTelegramDestination, resolveTelegramDestination } from './telegram-destination'

describe('Telegram semantic destinations', () => {
    const config = (values: Record<string, string | undefined>) => ({ get: (key: string) => values[key] })

    afterEach(() => {
        delete process.env.NODE_ENV
    })

    it('uses explicit support and logs destinations independently', () => {
        const reader = config({ TELEGRAM_SUPPORT_CHAT_ID: '-100200', TELEGRAM_LOGS_CHAT_ID: '-100300', TELEGRAM_ADMINCHAT_ID: '-100100' })
        expect(resolveTelegramDestination(reader, TELEGRAM_DESTINATION.SUPPORT)).toBe('-100200')
        expect(resolveTelegramDestination(reader, TELEGRAM_DESTINATION.LOGS)).toBe('-100300')
        expect(isTelegramDestination(reader, TELEGRAM_DESTINATION.SUPPORT, -100200)).toBe(true)
        expect(isTelegramDestination(reader, TELEGRAM_DESTINATION.SUPPORT, -100100)).toBe(false)
    })

    it('uses the legacy admin chat only outside production when an explicit destination is absent', () => {
        const reader = config({ TELEGRAM_ADMINCHAT_ID: '-100100' })
        process.env.NODE_ENV = 'test'
        expect(resolveTelegramDestination(reader, TELEGRAM_DESTINATION.LOGS)).toBe('-100100')
        process.env.NODE_ENV = 'production'
        expect(resolveTelegramDestination(reader, TELEGRAM_DESTINATION.LOGS)).toBe('')
    })
})
