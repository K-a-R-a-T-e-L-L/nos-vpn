import { enqueuePaymentAdminNotification } from './payment-admin-notification.outbox'
import { PaymentAdminNotificationStatus } from '../enum/payment-admin-notification-status.enum'

describe('enqueuePaymentAdminNotification', () => {
    it('uses ON CONFLICT DO NOTHING and stores no message or external identifiers', async () => {
        let values: any
        const builder = {
            insert: jest.fn(function () { return this }),
            into: jest.fn(function () { return this }),
            values: jest.fn(function (input) { values = input; return this }),
            orIgnore: jest.fn(function () { return this }),
            execute: jest.fn(async () => ({ identifiers: [] })),
        }
        const manager = { getRepository: jest.fn(() => ({ createQueryBuilder: () => builder })) }

        await enqueuePaymentAdminNotification(manager as any, '11111111-1111-4111-8111-111111111111')

        expect(builder.orIgnore).toHaveBeenCalledTimes(1)
        expect(values).toEqual(expect.objectContaining({
            paymentId: '11111111-1111-4111-8111-111111111111',
            status: PaymentAdminNotificationStatus.PENDING,
            attempts: 0,
        }))
        expect(values).not.toHaveProperty('message')
        expect(values).not.toHaveProperty('providerPaymentId')
        expect(values).not.toHaveProperty('chatId')
    })

    it('propagates arbitrary database failures', async () => {
        const failure = new Error('database unavailable')
        const builder: any = {
            insert() { return this },
            into() { return this },
            values() { return this },
            orIgnore() { return this },
            execute: jest.fn(async () => { throw failure }),
        }
        const manager = { getRepository: () => ({ createQueryBuilder: () => builder }) }
        await expect(enqueuePaymentAdminNotification(manager as any, '11111111-1111-4111-8111-111111111111')).rejects.toBe(failure)
    })
})
