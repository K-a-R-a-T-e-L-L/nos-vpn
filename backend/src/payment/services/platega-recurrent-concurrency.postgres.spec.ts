import { DataSource } from 'typeorm'

import { PaymentCanonicalProcessingService } from './payment-canonical-processing.service'
import { startDisposablePostgres } from '../../analytics/testing/disposable-postgres.helper'
import { Plan } from '../../plan/entity/plan.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { User } from '../../system/user/entity/user.entity'
import { PaymentAdminNotification } from '../entity/payment-admin-notification.entity'
import { PaymentMethod } from '../entity/payment-method.entity'
import { Payment } from '../entity/payment.entity'
import { PlategaRecurrentAgreement } from '../entity/platega-recurrent-agreement.entity'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'

jest.setTimeout(90_000)

describe('Platega recurrent PostgreSQL concurrency', () => {
    beforeEach(() => {
        // Freeze Date while leaving PostgreSQL socket and timeout scheduling real.
        jest.useFakeTimers({
            now: new Date('2026-09-01T00:00:00Z'),
            doNotFake: [
                'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
                'setTimeout', 'clearTimeout', 'hrtime', 'performance', 'queueMicrotask',
            ],
        })
    })

    afterEach(() => jest.useRealTimers())

    it('lets concurrent delivery extend exact-day access once for one charge id', async () => {
        const cluster = await startDisposablePostgres('nosvpn-platega-recurrent-pg-')
        let dataSource: DataSource | undefined
        let stopError: unknown
        try {
            console.info(`[platega-recurrent-postgres] pid=${cluster.pid} port=${cluster.port}`)
            dataSource = new DataSource({
                type: 'postgres',
                host: cluster.host,
                port: cluster.port,
                username: cluster.user,
                database: cluster.database,
                entities: [
                    User,
                    Plan,
                    Subscription,
                    PaymentMethod,
                    Payment,
                    PaymentAdminNotification,
                    PlategaRecurrentAgreement,
                ],
                synchronize: true,
                migrationsRun: false,
                dropSchema: false,
            })
            await dataSource.initialize()
            const user = await dataSource.getRepository(User).save({ email: 'platega-concurrency@example.test' })
            const plan = await dataSource
                .getRepository(Plan)
                .save({ name: '30 days', period: 30, amount: 500, isActive: true })
            const initialEndsAt = new Date('2026-09-10T00:00:00Z')
            const subscription = await dataSource.getRepository(Subscription).save({
                user,
                userId: user.id,
                plan,
                planId: plan.id,
                status: 'ACTIVE',
                yookassaPaymentId: '',
                nextPayAt: initialEndsAt,
                startAt: new Date('2026-08-11T00:00:00Z'),
                endsAt: initialEndsAt,
            } as any)
            const payment = await dataSource.getRepository(Payment).save({
                amount: 500,
                currency: 'RUB',
                userId: user.id,
                subscriptionId: subscription.id,
                planId: plan.id,
                provider: 'platega',
                merchant: PaymentMerchant.SITE,
                providerPaymentId: 'charge-concurrent-1',
                idempotencyKey: 'platega-concurrent-payment-1',
                status: PaymentStatusEnum.PENDING,
                isRecurring: true,
                metadataSnapshot: { recurrent_duration_days: 30 },
            } as any)
            const orchestrator = { activatePaidSubscription: jest.fn().mockResolvedValue({}) }
            const service = new PaymentCanonicalProcessingService(
                dataSource,
                { get: jest.fn() } as any,
                {} as any,
                orchestrator as any,
                {} as any,
                dataSource.getRepository(Payment),
                {} as any,
                {} as any,
            )

            await Promise.all([
                service.processConfirmedPlategaRecurrentCharge(payment.id, new Date('2026-10-10T00:00:00Z')),
                service.processConfirmedPlategaRecurrentCharge(payment.id, new Date('2026-10-10T00:00:00Z')),
            ])

            const refreshed = await dataSource.getRepository(Subscription).findOneByOrFail({ id: subscription.id })
            const expected = new Date('2026-10-10T00:00:00Z')
            expect(refreshed.endsAt).toEqual(expected)
            expect(orchestrator.activatePaidSubscription).toHaveBeenCalledTimes(1)
            expect(
                (await dataSource.getRepository(Payment).findOneByOrFail({ id: payment.id })).processedAt,
            ).toBeInstanceOf(Date)
        } finally {
            if (dataSource?.isInitialized) await dataSource.destroy().catch(() => undefined)
            try {
                cluster.stop()
            } catch (error) {
                console.error(
                    `[platega-recurrent-postgres] failed to stop pid=${cluster.pid} port=${cluster.port}`,
                    error,
                )
                stopError = error
            }
            if (stopError) throw stopError
        }
    })
})
