import { constants } from 'fs'
import { access, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { DataSource } from 'typeorm'

import { UserDeleteService } from './user-delete.service'
import { AnalyticsEvent } from '../../../analytics/entity/analytics-event.entity'
import { TrafficSource } from '../../../analytics/entity/traffic-source.entity'
import { UserAttribution } from '../../../analytics/entity/user-attribution.entity'
import { startDisposablePostgres } from '../../../analytics/testing/disposable-postgres.helper'
import { Meter } from '../../../billing/entities/meter.entity'
import { PlanLimit } from '../../../billing/entities/plan-limit.entity'
import { SubscriptionBalance } from '../../../billing/entities/subscription-balance.entity'
import { UsageEvent } from '../../../billing/entities/usage-event.entity'
import { UsageLineItem } from '../../../billing/entities/usage-line-item.entity'
import { PaymentAdminNotification } from '../../../payment/entity/payment-admin-notification.entity'
import { PaymentAttempt } from '../../../payment/entity/payment-attempt.entity'
import { PaymentMethod } from '../../../payment/entity/payment-method.entity'
import { PaymentWebhookEvent } from '../../../payment/entity/payment-webhook-event.entity'
import { Payment } from '../../../payment/entity/payment.entity'
import { PlategaRecurrentAgreement } from '../../../payment/entity/platega-recurrent-agreement.entity'
import { Plan } from '../../../plan/entity/plan.entity'
import { PromoCode } from '../../../promo/entity/promo-code.entity'
import { PromoUsage } from '../../../promo/entity/promo-usage.entity'
import { ReferralBonusLedger } from '../../../referral/entity/referral-bonus-ledger.entity'
import { SubscriptionRenewal } from '../../../subscription/entity/subscription-renewal.entity'
import { Subscription } from '../../../subscription/entity/subscription.entity'
import { SupportMessage } from '../../../support/entity/support-message.entity'
import { SupportThread } from '../../../support/entity/support-thread.entity'
import { SupportMediaStorageService } from '../../../support/services/support-media-storage.service'
import { VpnAccess } from '../../../vpn-access/entity/vpn-access.entity'
import { AccessOperationLog } from '../../../vpn-access/operations/access-operation-log.entity'
import { ServerNode } from '../../../vpn-provider/entity/server-node.entity'
import { TelegramAuthRequest } from '../entity/telegram-auth-request.entity'
import { TelegramSiteLinkRequest } from '../entity/telegram-site-link-request.entity'
import { User } from '../entity/user.entity'

const TARGET_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const CHILD_ID = '33333333-3333-4333-8333-333333333333'
const SUBSCRIPTION_ID = '44444444-4444-4444-8444-444444444444'
const PAYMENT_ID = '55555555-5555-4555-8555-555555555555'
const METHOD_ID = '66666666-6666-4666-8666-666666666666'
const ACCESS_ID = '77777777-7777-4777-8777-777777777777'

const entities = [
    User,
    Plan,
    Subscription,
    SubscriptionRenewal,
    Meter,
    PlanLimit,
    SubscriptionBalance,
    UsageEvent,
    UsageLineItem,
    Payment,
    PaymentMethod,
    PaymentAttempt,
    PaymentAdminNotification,
    PaymentWebhookEvent,
    PlategaRecurrentAgreement,
    PromoCode,
    PromoUsage,
    ReferralBonusLedger,
    SupportThread,
    SupportMessage,
    TelegramAuthRequest,
    TelegramSiteLinkRequest,
    TrafficSource,
    UserAttribution,
    AnalyticsEvent,
    ServerNode,
    VpnAccess,
    AccessOperationLog,
]

jest.setTimeout(90_000)

describe('UserService hard delete PostgreSQL transaction', () => {
    it('rolls every child mutation back on failure, then deletes all dependencies on retry', async () => {
        const cluster = await startDisposablePostgres('nosvpn-hard-delete-pg-')
        let dataSource: DataSource | undefined
        let stopError: unknown
        const mediaRoot = await mkdtemp(join(tmpdir(), 'nosvpn-hard-delete-media-'))

        try {
            console.info(`[hard-delete-postgres] pid=${cluster.pid} port=${cluster.port}`)
            dataSource = new DataSource({
                type: 'postgres',
                host: cluster.host,
                port: cluster.port,
                username: cluster.user,
                database: cluster.database,
                entities,
                synchronize: true,
                migrationsRun: false,
                dropSchema: false,
            })
            await dataSource.initialize()
            await seedGraph(dataSource)
            const targetThread = await dataSource.getRepository(SupportThread).findOneByOrFail({ userId: TARGET_ID })
            const mediaKeys = [
                '11111111-1111-4111-8111-111111111111.png',
                '22222222-2222-4222-8222-222222222222.jpg',
            ]
            for (const key of mediaKeys) {
                await writeFile(join(mediaRoot, key), Buffer.from('fixture-media'))
                await dataSource.getRepository(SupportMessage).save({
                    thread: targetThread,
                    threadId: targetThread.id,
                    userId: TARGET_ID,
                    authorType: 'USER',
                    source: 'WEBSITE',
                    contentKind: 'PHOTO',
                    text: null,
                    attachment: { storageProvider: 'FILESYSTEM', storageKey: key, mimeType: 'image/png', byteSize: 13 },
                } as any)
            }
            await dataSource.getRepository(SupportMessage).save({
                thread: targetThread,
                threadId: targetThread.id,
                userId: TARGET_ID,
                authorType: 'USER',
                source: 'TELEGRAM',
                contentKind: 'PHOTO',
                text: null,
                attachment: { telegramFileId: 'legacy-only' },
            } as any)

            const service = Object.create(UserDeleteService.prototype) as any
            service.userRepository = dataSource.getRepository(User)
            service.dataSource = dataSource
            service.subscriptionService = {
                getResolvedById: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: 'STOPPED' }),
                stopSubscription: jest.fn(),
            }
            service.vpnAccessService = { findProvisionableBySubscription: jest.fn().mockResolvedValue(null) }
            service.supportMediaStorage = new SupportMediaStorageService({ get: jest.fn(() => mediaRoot) } as any, { warn: jest.fn() } as any)

            await dataSource.query(`
                CREATE FUNCTION fail_target_payment_delete() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'fixture payment delete failure'; END $$;
                CREATE TRIGGER fail_target_payment_delete BEFORE DELETE ON payments
                FOR EACH ROW WHEN (OLD.id = '${PAYMENT_ID}'::uuid) EXECUTE FUNCTION fail_target_payment_delete();
            `)

            await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).rejects.toThrow(
                'fixture payment delete failure',
            )
            for (const key of mediaKeys) await access(join(mediaRoot, key), constants.F_OK)
            await expectTargetGraph(dataSource, 1, 4)
            expect(await dataSource.getRepository(User).countBy({ id: CHILD_ID })).toBe(1)
            expect((await dataSource.getRepository(User).findOneByOrFail({ id: CHILD_ID })).referredByUserId).toBe(
                TARGET_ID,
            )

            await dataSource.query('DROP TRIGGER fail_target_payment_delete ON payments')
            await dataSource.query('DROP FUNCTION fail_target_payment_delete()')

            await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).resolves.toEqual({
                ok: true,
                id: TARGET_ID,
            })
            await expectTargetGraph(dataSource, 0)
            for (const key of mediaKeys) await expect(access(join(mediaRoot, key), constants.F_OK)).rejects.toThrow()
            expect(await dataSource.getRepository(User).countBy({ id: TARGET_ID })).toBe(0)
            expect(await dataSource.getRepository(User).countBy({ id: CHILD_ID })).toBe(1)
            expect((await dataSource.getRepository(User).findOneByOrFail({ id: CHILD_ID })).referredByUserId).toBeNull()
            await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).rejects.toMatchObject({
                response: expect.objectContaining({ message: 'ENTITY_NOT_FOUND' }),
            })
        } finally {
            if (dataSource?.isInitialized) await dataSource.destroy().catch(() => undefined)
            await rm(mediaRoot, { recursive: true, force: true }).catch(() => undefined)
            try {
                cluster.stop()
            } catch (error) {
                console.error(`[hard-delete-postgres] failed to stop pid=${cluster.pid} port=${cluster.port}`, error)
                stopError = error
            }
            if (stopError) throw stopError
        }
    })
})

async function seedGraph(dataSource: DataSource) {
    const now = new Date()
    const target = await dataSource.getRepository(User).save({ id: TARGET_ID, email: 'target@example.test' })
    const actor = await dataSource
        .getRepository(User)
        .save({ id: ACTOR_ID, email: 'actor@example.test', role: 'ADMIN' } as any)
    await dataSource
        .getRepository(User)
        .save({ id: CHILD_ID, email: 'child@example.test', referredByUserId: TARGET_ID })
    const plan = await dataSource.getRepository(Plan).save({ name: 'Fixture plan', period: 30, amount: 100 })
    const subscription = await dataSource.getRepository(Subscription).save({
        id: SUBSCRIPTION_ID,
        user: target,
        userId: TARGET_ID,
        plan,
        planId: plan.id,
        status: 'STOPPED',
        yookassaPaymentId: '',
        nextPayAt: now,
        startAt: now,
    } as any)
    const method = await dataSource.getRepository(PaymentMethod).save({
        id: METHOD_ID,
        user: target,
        userId: TARGET_ID,
        provider: 'YOOKASSA',
        merchant: 'SITE',
        providerMethodId: 'fixture-method',
        status: 'ACTIVE',
    } as any)
    const payment = await dataSource.getRepository(Payment).save({
        id: PAYMENT_ID,
        amount: 100,
        currency: 'RUB',
        status: 'SUCCEEDED',
        provider: 'YOOKASSA',
        providerPaymentId: 'fixture-provider-payment',
        user: target,
        userId: TARGET_ID,
        subscription,
        subscriptionId: SUBSCRIPTION_ID,
        plan,
        planId: plan.id,
        paymentMethod: method,
        paymentMethodId: METHOD_ID,
    } as any)
    const renewal = await dataSource.getRepository(SubscriptionRenewal).save({
        subscription,
        subscriptionId: SUBSCRIPTION_ID,
        paymentMethod: method,
        paymentMethodId: METHOD_ID,
        merchant: 'SITE',
        periodStart: now,
        periodEnd: now,
        billingPeriodKey: 'fixture-period',
        status: 'SUCCEEDED',
        succeededPayment: payment,
        succeededPaymentId: PAYMENT_ID,
    } as any)
    await dataSource.getRepository(PlategaRecurrentAgreement).save({
        provider: 'PLATEGA',
        merchant: 'SITE',
        userId: TARGET_ID,
        subscriptionId: SUBSCRIPTION_ID,
        planId: plan.id,
        planSnapshot: { name: plan.name, period: plan.period, amount: plan.amount },
        providerSubscriptionId: 'fixture-platega-subscription',
        createIdempotencyKey: 'fixture-create-operation',
        rawProviderStatus: 'Active',
        normalizedStatus: 'ACTIVE',
        amount: 100,
        currency: 'RUB',
        providerInterval: 3,
        intervalCount: 1,
        durationDays: 30,
    } as any)
    await dataSource.getRepository(PaymentAttempt).save({
        payment,
        paymentId: PAYMENT_ID,
        renewal,
        renewalId: renewal.id,
        attemptType: 'INITIAL',
        attemptNumber: 1,
        provider: 'YOOKASSA',
        merchant: 'SITE',
        idempotencyKey: 'fixture-attempt',
        status: 'SUCCEEDED',
        retryable: false,
    } as any)
    await dataSource.getRepository(PaymentAdminNotification).save({
        payment,
        paymentId: PAYMENT_ID,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: null,
        sentAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
    } as any)
    await dataSource.getRepository(PaymentWebhookEvent).save({
        provider: 'yookassa',
        providerPaymentId: 'fixture-provider-payment',
        eventType: 'payment.succeeded',
        signatureValid: true,
        processed: true,
        receivedAt: now,
        idempotencyKey: 'fixture-webhook',
    })
    const promo = await dataSource.getRepository(PromoCode).save({
        code: 'FIXTURE',
        name: 'Fixture',
        valuePercent: 10,
        expiresAt: new Date(now.getTime() + 86_400_000),
    })
    await dataSource
        .getRepository(PromoUsage)
        .save({ promoCode: promo, promoCodeId: promo.id, user: target, userId: TARGET_ID })
    await dataSource.getRepository(ReferralBonusLedger).save({
        referrerUserId: TARGET_ID,
        referredUserId: CHILD_ID,
        subscriptionId: SUBSCRIPTION_ID,
        paymentId: PAYMENT_ID,
        bonusRub: 50,
        bonusPercent: 50,
        status: 'AWARDED',
        eligibleAt: now,
    } as any)
    const thread = await dataSource.getRepository(SupportThread).save({ user: target, userId: TARGET_ID })
    await dataSource.getRepository(SupportMessage).save({
        thread,
        threadId: thread.id,
        user: target,
        userId: TARGET_ID,
        authorType: 'USER',
        source: 'SITE',
        text: 'fixture',
    } as any)
    await dataSource.getRepository(TelegramAuthRequest).save({
        requestTokenHash: 'fixture-request',
        botTokenHash: 'fixture-bot',
        expiresAt: new Date(now.getTime() + 60_000),
        user: target,
        userId: TARGET_ID,
    })
    await dataSource.getRepository(TelegramSiteLinkRequest).save({
        codeHash: 'fixture-link',
        telegramId: 100001,
        expiresAt: new Date(now.getTime() + 60_000),
        linkedUser: target,
        linkedUserId: TARGET_ID,
    })
    const source = await dataSource.getRepository(TrafficSource).save({ code: 'fixture', name: 'Fixture' })
    await dataSource
        .getRepository(UserAttribution)
        .save({ user: target, userId: TARGET_ID, source, sourceId: source.id })
    await dataSource.getRepository(AnalyticsEvent).save({ user: target, userId: TARGET_ID, eventType: 'fixture' })
    const meter = await dataSource.getRepository(Meter).save({ code: 'fixture', name: 'Fixture' })
    await dataSource.getRepository(SubscriptionBalance).save({
        subscription,
        subscriptionId: SUBSCRIPTION_ID,
        meter,
        meterId: meter.id,
        usedUnits: 1,
        includedUnits: 1,
        periodStart: now,
        periodEnd: now,
    })
    const node = await dataSource.getRepository(ServerNode).save({
        code: 'fixture',
        name: 'Fixture',
        region: 'test',
        providerType: 'REMNAWAVE',
        baseUrl: 'https://example.test',
    } as any)
    const access = await dataSource.getRepository(VpnAccess).save({
        id: ACCESS_ID,
        subscription,
        subscriptionId: SUBSCRIPTION_ID,
        user: target,
        userId: TARGET_ID,
        providerType: 'REMNAWAVE',
        serverNode: node,
        serverNodeId: node.id,
        inboundKey: 'fixture',
        status: 'DISABLED',
        accessStartsAt: now,
        accessEndsAt: now,
    } as any)
    await dataSource.getRepository(AccessOperationLog).save({
        operationKey: 'fixture-operation',
        operationType: 'DISABLE',
        subscriptionId: SUBSCRIPTION_ID,
        accessId: access.id,
        providerType: 'REMNAWAVE',
        status: 'SUCCESS',
    } as any)
    expect(actor.id).toBe(ACTOR_ID)
}

async function expectTargetGraph(dataSource: DataSource, expected: number, expectedSupportMessages = expected) {
    const checks: Array<[unknown, Record<string, unknown>]> = [
        [Subscription, { userId: TARGET_ID }],
        [SubscriptionRenewal, { subscriptionId: SUBSCRIPTION_ID }],
        [SubscriptionBalance, { subscriptionId: SUBSCRIPTION_ID }],
        [VpnAccess, { userId: TARGET_ID }],
        [AccessOperationLog, { subscriptionId: SUBSCRIPTION_ID }],
        [Payment, { userId: TARGET_ID }],
        [PaymentAttempt, { paymentId: PAYMENT_ID }],
        [PaymentAdminNotification, { paymentId: PAYMENT_ID }],
        [PaymentWebhookEvent, { provider: 'yookassa', providerPaymentId: 'fixture-provider-payment' }],
        [PlategaRecurrentAgreement, { userId: TARGET_ID }],
        [PaymentMethod, { userId: TARGET_ID }],
        [ReferralBonusLedger, { referrerUserId: TARGET_ID }],
        [PromoUsage, { userId: TARGET_ID }],
        [SupportMessage, { userId: TARGET_ID }],
        [SupportThread, { userId: TARGET_ID }],
        [TelegramAuthRequest, { userId: TARGET_ID }],
        [TelegramSiteLinkRequest, { linkedUserId: TARGET_ID }],
        [UserAttribution, { userId: TARGET_ID }],
        [AnalyticsEvent, { userId: TARGET_ID }],
    ]
    for (const [entity, where] of checks) {
        const value = await dataSource.getRepository(entity as any).countBy(where as any)
        expect(value).toBe(entity === SupportMessage ? expectedSupportMessages : expected)
    }
}
