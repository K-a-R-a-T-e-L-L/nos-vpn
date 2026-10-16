import { PaymentAdminNotificationService } from './payment-admin-notification.service'
import { PaymentActivationStatus } from '../enum/payment-activation-status.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentAdminNotificationError } from '../types/payment-admin-notification.error'

describe('PaymentAdminNotificationService', () => {
    const payment = {
        id: '12345678-1111-4111-8111-111111111111',
        amount: 399,
        currency: 'RUB',
        provider: 'yookassa',
        merchant: PaymentMerchant.SITE,
        isRecurring: false,
        status: PaymentStatusEnum.SUCCEEDED,
        paidAt: new Date('2026-08-01T12:30:00.000Z'),
        activationStatus: PaymentActivationStatus.SUCCEEDED,
        userId: 'abcdef12-1111-4111-8111-111111111111',
        planId: 'plan-1',
        metadataSnapshot: { promo_id: 'promo-1' },
    }
    let hasEarlierPayment = false
    const payments = {
        createQueryBuilder: jest.fn(() => ({
            select() { return this },
            addSelect() { return this },
            where() { return this },
            andWhere() { return this },
            setParameters() { return this },
            getRawOne: async () => ({
                ...payment,
                paidAt: payment.paidAt.toISOString(),
                promoId: 'promo-1',
            }),
            getExists: async () => hasEarlierPayment,
        })),
    }
    const users = {
        findOne: jest.fn(async () => ({
            id: payment.userId,
            email: 'unsafe<mail>@example.com',
            telegramUsername: 'alice<script>',
            telegramFirstName: 'Alice',
            telegramLastName: 'A',
        })),
    }
    const plans = {
        findOne: jest.fn(async () => ({ id: 'plan-1', title: 'VIP <30>', name: 'VIP', code: 'vip' })),
    }
    const promos = { findOne: jest.fn(async () => ({ id: 'promo-1', code: 'SAVE<50>' })) }
    const notification = { notify: jest.fn(async () => ({ message_id: 1 })) }
    const config = { get: jest.fn((key: string) => key === 'TELEGRAM_ADMINCHAT_ID' ? '-100123' : undefined) }

    function createService() {
        return new PaymentAdminNotificationService(
            config as any,
            notification as any,
            payments as any,
            users as any,
            plans as any,
            promos as any,
        )
    }

    beforeEach(() => {
        jest.clearAllMocks()
        hasEarlierPayment = false
    })

    it('sends an HTML-safe SITE YooKassa first purchase with only short internal ids', async () => {
        await createService().send(payment.id)

        expect(notification.notify).toHaveBeenCalledTimes(1)
        const [chatId, message, extra] = notification.notify.mock.calls[0] as any[]
        expect(chatId).toBe('-100123')
        expect(extra).toEqual({ parse_mode: 'HTML' })
        expect(message).toContain('Канал: SITE')
        expect(message).toContain('Тип: Первая покупка')
        expect(message).toContain('Провайдер: YooKassa')
        expect(message).toContain('@alice&lt;script&gt;')
        expect(message).toContain('VIP &lt;30&gt;')
        expect(message).toContain('SAVE&lt;50&gt;')
        expect(message).toContain('Payment: 12345678')
        expect(message).toContain('01.08.2026')
        expect(message).not.toContain(payment.userId)
        expect(message).not.toContain('providerPaymentId')
        expect(message).not.toContain('paymentMethodId')
        expect(message).not.toContain('subscriptionUrl')
    })

    it.each([
        [true, true, 'Автосписание'],
        [false, true, 'Ручное продление'],
        [false, false, 'Первая покупка'],
    ])('classifies recurring=%s earlier=%s as %s', (isRecurring, hasEarlier, expected) => {
        expect((createService() as any).classifyPaymentType(isRecurring, hasEarlier)).toBe(expected)
    })

    it('formats Platega and safe label fallbacks', () => {
        const service = createService() as any
        expect(service.formatProvider(PaymentProvider.PLATEGA)).toBe('Platega')
        expect(service.buildUserLabel({ email: 'mail@example.com' }, 'abcdef12-x')).toBe('mail@example.com')
        expect(service.buildUserLabel({ telegramFirstName: 'A', telegramLastName: 'B' }, 'abcdef12-x')).toBe('A B')
        expect(service.buildUserLabel({}, 'abcdef12-x')).toBe('user #abcdef12')
    })

    it('uses the deterministic earlier-payment query for a manual renewal', async () => {
        hasEarlierPayment = true
        await createService().send(payment.id)
        expect((notification.notify.mock.calls[0] as any[])[1]).toContain('Тип: Ручное продление')
        expect(payments.createQueryBuilder).toHaveBeenCalledTimes(2)
    })

    it('formats a BOT Platega recurrent payment as an autopayment', async () => {
        const originalProvider = payment.provider
        const originalMerchant = payment.merchant
        const originalRecurring = payment.isRecurring
        payment.provider = 'platega'
        payment.merchant = PaymentMerchant.BOT
        payment.isRecurring = true
        try {
            await createService().send(payment.id)
            const message = (notification.notify.mock.calls[0] as any[])[1]
            expect(message).toContain('Канал: BOT')
            expect(message).toContain('Провайдер: Platega')
            expect(message).toContain('Тип: Автосписание')
        } finally {
            payment.provider = originalProvider
            payment.merchant = originalMerchant
            payment.isRecurring = originalRecurring
        }
    })

    it('returns a terminal safe error when admin chat is not configured', async () => {
        config.get.mockReturnValueOnce('')
        await expect(createService().send(payment.id)).rejects.toMatchObject({
            code: 'ADMIN_CHAT_NOT_CONFIGURED',
            terminal: true,
        })
        expect(notification.notify).not.toHaveBeenCalled()
    })

    it.each([
        [{ response: { error_code: 403 } }, 'TELEGRAM_FORBIDDEN', true],
        [{ response: { error_code: 429 } }, 'TELEGRAM_RATE_LIMITED', false],
        [{ response: { parameters: { migrate_to_chat_id: -100999 } } }, 'TELEGRAM_CHAT_MIGRATED', true],
        [new Error('socket failure'), 'TELEGRAM_TEMPORARY_ERROR', false],
    ])('classifies Telegram failures without retaining raw payload', (error, code, terminal) => {
        const classified = (createService() as any).classifyTelegramError(error) as PaymentAdminNotificationError
        expect(classified).toMatchObject({ code, terminal })
        expect(classified.message).toBe(code)
    })
})
