import { SubscriptionRecurrentPaymentJob, createRecurrentIdempotencyKey } from './subscription-recurrent-payment.job'

describe('SubscriptionRecurrentPaymentJob', () => {
    it('creates a distinct UUID-v4 idempotency key for each new recurrent local payment', () => {
        const first = createRecurrentIdempotencyKey()
        const second = createRecurrentIdempotencyKey()
        expect(first).toHaveLength(36)
        expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
        expect(second).not.toBe(first)
    })

    it('does not claim or call a provider while recurrent payments are disabled', async () => {
        const dataSource = { transaction: jest.fn() }
        const job = new SubscriptionRecurrentPaymentJob(
            dataSource as any,
            { get: jest.fn(() => 'false') } as any,
            {} as any,
            {} as any,
            { createRecurrentPayment: jest.fn() } as any,
            {} as any,
            {} as any,
        )
        await job.run()
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })
})
