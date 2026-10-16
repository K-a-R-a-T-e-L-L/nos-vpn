import { SupportService } from './support.service'

describe('SupportService Telegram routing', () => {
    it('sends support-admin notifications only to TELEGRAM_SUPPORT_CHAT_ID', async () => {
        const notificationService = { notify: jest.fn().mockResolvedValue(undefined) }
        const config = {
            get: jest.fn((key: string) => ({
                TELEGRAM_SUPPORT_CHAT_ID: '-100200',
                TELEGRAM_ADMINCHAT_ID: '-100100',
            })[key]),
        }
        const service = new SupportService(
            {} as any,
            {} as any,
            {} as any,
            notificationService as any,
            config as any,
            { warn: jest.fn(), error: jest.fn() } as any,
            {} as any,
        )

        await (service as any).notifyAdminAboutUserMessage(
            { id: '11111111-1111-4111-8111-111111111111' },
            { telegramId: '42', email: null, telegramUsername: null, telegramFirstName: 'User', telegramLastName: null, id: 'user-1' },
            'Нужна помощь',
            'TELEGRAM',
        )

        expect(notificationService.notify).toHaveBeenCalledWith(
            '-100200',
            expect.stringContaining('🆘 Новое сообщение в поддержку'),
            expect.any(Object),
        )
        expect(notificationService.notify).not.toHaveBeenCalledWith('-100100', expect.anything(), expect.anything())
    })
})
