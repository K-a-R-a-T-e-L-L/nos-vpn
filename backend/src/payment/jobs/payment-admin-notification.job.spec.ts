import { PaymentAdminNotificationJob } from './payment-admin-notification.job'
import { PaymentAdminNotificationStatus } from '../enum/payment-admin-notification-status.enum'
import { PaymentAdminNotificationError } from '../types/payment-admin-notification.error'

describe('PaymentAdminNotificationJob', () => {
    const row = {
        id: 'outbox-1',
        paymentId: 'payment-1',
        status: PaymentAdminNotificationStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(0),
        leaseToken: null,
        leaseExpiresAt: null,
    }
    const queryBuilder: any = {
        setLock: jest.fn(function () { return this }),
        setOnLocked: jest.fn(function () { return this }),
        where: jest.fn(function () { return this }),
        setParameters: jest.fn(function () { return this }),
        orderBy: jest.fn(function () { return this }),
        addOrderBy: jest.fn(function () { return this }),
        getOne: jest.fn(async () => {
            if ([PaymentAdminNotificationStatus.SENT, PaymentAdminNotificationStatus.TERMINAL].includes(row.status)) return null
            if (row.status === PaymentAdminNotificationStatus.SENDING && row.leaseExpiresAt && row.leaseExpiresAt > new Date()) return null
            return row
        }),
    }
    const savedSnapshots: any[] = []
    const manager = {
        getRepository: jest.fn(() => ({ createQueryBuilder: () => queryBuilder })),
        save: jest.fn(async (value: any) => {
            const snapshot = { ...value }
            savedSnapshots.push(snapshot)
            return snapshot
        }),
    }
    const dataSource = { transaction: jest.fn(async (work: any) => work(manager)) }
    const repository = {
        update: jest.fn(async (_criteria: any, patch: any) => {
            Object.assign(row, patch)
            return { affected: 1 }
        }),
    }
    const sender = { send: jest.fn(async () => undefined) }
    const config = { get: jest.fn(() => 'true') }

    function createJob() {
        return new PaymentAdminNotificationJob(
            dataSource as any,
            config as any,
            repository as any,
            sender as any,
        )
    }

    beforeEach(() => {
        jest.clearAllMocks()
        row.status = PaymentAdminNotificationStatus.PENDING
        row.attempts = 0
        row.leaseToken = null
        row.leaseExpiresAt = null
        row.nextAttemptAt = new Date(0)
        savedSnapshots.length = 0
    })

    it('claims with a short transaction, sends after commit and marks SENT', async () => {
        let transactionFinished = false
        dataSource.transaction.mockImplementationOnce(async (work: any) => {
            const result = await work(manager)
            transactionFinished = true
            return result
        })
        sender.send.mockImplementationOnce(async () => {
            expect(transactionFinished).toBe(true)
        })

        await createJob().run()

        expect(savedSnapshots).toContainEqual(expect.objectContaining({
            status: PaymentAdminNotificationStatus.SENDING,
            attempts: 1,
            leaseToken: expect.any(String),
            leaseExpiresAt: expect.any(Date),
        }))
        expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write')
        expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked')
        expect(sender.send).toHaveBeenCalledWith('payment-1')
        expect(repository.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'outbox-1', status: PaymentAdminNotificationStatus.SENDING }),
            expect.objectContaining({ status: PaymentAdminNotificationStatus.SENT, sentAt: expect.any(Date) }),
        )
    })

    it('reclaims an expired SENDING lease and concurrent/follow-up runs do not send twice', async () => {
        row.status = PaymentAdminNotificationStatus.SENDING
        row.leaseExpiresAt = new Date(Date.now() - 1)
        row.leaseToken = '11111111-1111-4111-8111-111111111111'

        await createJob().run()
        await createJob().run()

        expect(sender.send).toHaveBeenCalledTimes(1)
        expect(row.status).toBe(PaymentAdminNotificationStatus.SENT)
    })

    it('does nothing when the safety flag is disabled', async () => {
        config.get.mockReturnValueOnce('false')
        await createJob().run()
        expect(dataSource.transaction).not.toHaveBeenCalled()
        expect(sender.send).not.toHaveBeenCalled()
    })

    it.each([
        [1, 1],
        [2, 5],
        [3, 30],
        [4, 120],
    ])('uses retry delay for attempt %s', (attempt, minutes) => {
        expect((createJob() as any).retryDelayMs(attempt)).toBe(minutes * 60_000)
    })

    it('marks a temporary failure RETRYABLE and an exhausted attempt TERMINAL', async () => {
        sender.send.mockRejectedValueOnce(new PaymentAdminNotificationError('TELEGRAM_TEMPORARY_ERROR', false))
        await createJob().run()
        expect(repository.update).toHaveBeenLastCalledWith(
            expect.any(Object),
            expect.objectContaining({ status: PaymentAdminNotificationStatus.RETRYABLE, lastErrorCode: 'TELEGRAM_TEMPORARY_ERROR' }),
        )

        row.attempts = 4
        row.nextAttemptAt = new Date(0)
        sender.send.mockRejectedValueOnce(new PaymentAdminNotificationError('TELEGRAM_TEMPORARY_ERROR', false))
        await createJob().run()
        expect(repository.update).toHaveBeenLastCalledWith(
            expect.any(Object),
            expect.objectContaining({ status: PaymentAdminNotificationStatus.TERMINAL, nextAttemptAt: null }),
        )
    })

    it('marks configuration errors TERMINAL immediately', async () => {
        sender.send.mockRejectedValueOnce(new PaymentAdminNotificationError('ADMIN_CHAT_NOT_CONFIGURED', true))
        await createJob().run()
        expect(repository.update).toHaveBeenLastCalledWith(
            expect.any(Object),
            expect.objectContaining({ status: PaymentAdminNotificationStatus.TERMINAL, lastErrorCode: 'ADMIN_CHAT_NOT_CONFIGURED' }),
        )
    })
})
