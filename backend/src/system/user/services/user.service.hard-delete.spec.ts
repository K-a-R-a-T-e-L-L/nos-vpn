import { DataSource } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'

import { UserDeleteService } from './user-delete.service'
import { AnalyticsEvent } from '../../../analytics/entity/analytics-event.entity'
import { UserAttribution } from '../../../analytics/entity/user-attribution.entity'
import { SubscriptionBalance } from '../../../billing/entities/subscription-balance.entity'
import { PaymentAdminNotification } from '../../../payment/entity/payment-admin-notification.entity'
import { PaymentAttempt } from '../../../payment/entity/payment-attempt.entity'
import { PaymentMethod } from '../../../payment/entity/payment-method.entity'
import { PaymentWebhookEvent } from '../../../payment/entity/payment-webhook-event.entity'
import { Payment } from '../../../payment/entity/payment.entity'
import { PlategaRecurrentAgreement } from '../../../payment/entity/platega-recurrent-agreement.entity'
import { PromoUsage } from '../../../promo/entity/promo-usage.entity'
import { ReferralBonusLedger } from '../../../referral/entity/referral-bonus-ledger.entity'
import { SubscriptionRenewal } from '../../../subscription/entity/subscription-renewal.entity'
import { Subscription } from '../../../subscription/entity/subscription.entity'
import { StatusesEnum } from '../../../subscription/enum/statuses.enum'
import { SubscriptionLifecycleOrchestrator } from '../../../subscription/services/subscription-lifecycle.orchestrator'
import { SupportMessage } from '../../../support/entity/support-message.entity'
import { SupportThread } from '../../../support/entity/support-thread.entity'
import { VpnAccess } from '../../../vpn-access/entity/vpn-access.entity'
import { AccessOperationLog } from '../../../vpn-access/operations/access-operation-log.entity'
import { UserAdminController } from '../controllers/user.admin.controller'
import { TelegramAuthRequest } from '../entity/telegram-auth-request.entity'
import { TelegramSiteLinkRequest } from '../entity/telegram-site-link-request.entity'
import { User } from '../entity/user.entity'
import { RolesEnum } from '../enum/roles.enum'

const TARGET_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const SUBSCRIPTION_ID = '33333333-3333-4333-8333-333333333333'
const ACCESS_ID = '44444444-4444-4444-8444-444444444444'
const PAYMENT_ID = '55555555-5555-4555-8555-555555555555'

function createService(overrides: Record<string, unknown> = {}) {
    const service = Object.create(UserDeleteService.prototype) as any
    Object.assign(service, {
        userRepository: {
            findOne: jest.fn().mockResolvedValue({
                id: TARGET_ID,
                telegramId: 100001,
                subscription: { id: SUBSCRIPTION_ID, status: StatusesEnum.ACTIVE },
            }),
        },
        subscriptionService: {
            getResolvedById: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: StatusesEnum.ACTIVE }),
            stopSubscription: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: StatusesEnum.STOPPED }),
        },
        vpnAccessService: { findProvisionableBySubscription: jest.fn().mockResolvedValue(null) },
        dataSource: { transaction: jest.fn() } satisfies Partial<DataSource>,
        supportMediaStorage: { cleanupMany: jest.fn().mockResolvedValue(undefined) },
        ...overrides,
    })
    return service
}

function repositoryMock() {
    return {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
        update: jest.fn().mockResolvedValue({ affected: 0 }),
        createQueryBuilder: jest.fn(),
    }
}

describe('UserService permanentlyDeleteUser', () => {
    it('keeps the admin controller guard and passes the authenticated actor id', async () => {
        const permanentlyDeleteUser = jest.fn().mockResolvedValue({ ok: true, id: TARGET_ID })
        const controller = new UserAdminController({ permanentlyDeleteUser } as any, {} as any, {} as any, {} as any, {} as any)

        await expect(controller.remove(TARGET_ID, { id: ACTOR_ID } as User)).resolves.toEqual({
            ok: true,
            id: TARGET_ID,
        })
        expect(permanentlyDeleteUser).toHaveBeenCalledWith(TARGET_ID, ACTOR_ID)
        expect(Reflect.getMetadata('role', UserAdminController.prototype.remove)).toBe(RolesEnum.ADMIN)
    })

    it('rejects deleting the actor account before external or database mutation', async () => {
        const service = createService()

        await expect(service.permanentlyDeleteUser(TARGET_ID, TARGET_ID)).rejects.toMatchObject({
            message: ErrorCodeEnum.FORBIDDEN,
        })
        expect(service.subscriptionService.stopSubscription).not.toHaveBeenCalled()
        expect(service.dataSource.transaction).not.toHaveBeenCalled()
    })

    it('aborts database deletion when external access cleanup genuinely fails', async () => {
        const cleanupError = new Error('provider timeout')
        const service = createService({
            subscriptionService: {
                getResolvedById: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: StatusesEnum.ACTIVE }),
                stopSubscription: jest.fn().mockRejectedValue(cleanupError),
            },
        })

        await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).rejects.toBe(cleanupError)
        expect(service.dataSource.transaction).not.toHaveBeenCalled()
    })

    it('deletes a user without a subscription without calling external cleanup', async () => {
        const service = createService({
            userRepository: { findOne: jest.fn().mockResolvedValue({ id: TARGET_ID, telegramId: null }) },
        })
        service.dataSource.transaction.mockResolvedValue(undefined)

        await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).resolves.toEqual({ ok: true, id: TARGET_ID })
        expect(service.subscriptionService.stopSubscription).not.toHaveBeenCalled()
        expect(service.dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('returns the existing NotFound contract on a repeated delete without starting cleanup', async () => {
        const service = createService({
            userRepository: { findOne: jest.fn().mockResolvedValue(null) },
        })

        await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).rejects.toMatchObject({
            message: ErrorCodeEnum.ENTITY_NOT_FOUND,
        })
        expect(service.subscriptionService.stopSubscription).not.toHaveBeenCalled()
        expect(service.dataSource.transaction).not.toHaveBeenCalled()
    })

    it('cleans unique filesystem media keys only after the database transaction resolves', async () => {
        const cleanupMany = jest.fn().mockResolvedValue(undefined)
        const service = createService({ supportMediaStorage: { cleanupMany } })
        service.dataSource.transaction.mockResolvedValue([
            '11111111-1111-4111-8111-111111111111.png',
            '11111111-1111-4111-8111-111111111111.png',
            '22222222-2222-4222-8222-222222222222.jpg',
        ])

        await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).resolves.toEqual({ ok: true, id: TARGET_ID })
        expect(cleanupMany).toHaveBeenCalledWith([
            '11111111-1111-4111-8111-111111111111.png',
            '11111111-1111-4111-8111-111111111111.png',
            '22222222-2222-4222-8222-222222222222.jpg',
        ])
    })

    it('treats an already stopped subscription as an idempotent no-op and continues deletion', async () => {
        const service = createService({
            subscriptionService: {
                getResolvedById: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: StatusesEnum.STOPPED }),
                stopSubscription: jest.fn(),
            },
        })
        service.dataSource.transaction.mockResolvedValue(undefined)

        await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).resolves.toEqual({ ok: true, id: TARGET_ID })
        expect(service.subscriptionService.stopSubscription).not.toHaveBeenCalled()
        expect(service.dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('still invokes the existing stop mechanism for a provisionable access in an unexpected local state', async () => {
        const service = createService({
            subscriptionService: {
                getResolvedById: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: StatusesEnum.STOPPED }),
                stopSubscription: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: StatusesEnum.STOPPED }),
            },
            vpnAccessService: {
                findProvisionableBySubscription: jest.fn().mockResolvedValue({ id: ACCESS_ID, status: 'ERROR' }),
            },
        })
        service.dataSource.transaction.mockResolvedValue(undefined)

        await service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)
        expect(service.subscriptionService.stopSubscription).toHaveBeenCalledWith(TARGET_ID)
    })

    it('deletes the complete account graph through transaction-manager repositories and the user last', async () => {
        const repositories = new Map<unknown, ReturnType<typeof repositoryMock>>()
        for (const entity of [
            User,
            Subscription,
            SubscriptionRenewal,
            SubscriptionBalance,
            VpnAccess,
            AccessOperationLog,
            Payment,
            PaymentAttempt,
            PaymentAdminNotification,
            PaymentWebhookEvent,
            PaymentMethod,
            PlategaRecurrentAgreement,
            ReferralBonusLedger,
            PromoUsage,
            SupportMessage,
            SupportThread,
            TelegramAuthRequest,
            TelegramSiteLinkRequest,
            UserAttribution,
            AnalyticsEvent,
        ])
            repositories.set(entity, repositoryMock())

        repositories.get(User)!.findOne.mockResolvedValue({ id: TARGET_ID, telegramId: 100001 })
        repositories.get(Subscription)!.find.mockResolvedValue([{ id: SUBSCRIPTION_ID }])
        repositories.get(VpnAccess)!.find.mockResolvedValue([{ id: ACCESS_ID }])
        repositories.get(PlategaRecurrentAgreement)!.find.mockResolvedValue([])
        repositories
            .get(Payment)!
            .find.mockResolvedValue([{ id: PAYMENT_ID, provider: 'yookassa', providerPaymentId: 'provider-fixture-1' }])

        const manager = { getRepository: jest.fn((entity: unknown) => repositories.get(entity)) }
        const service = createService()
        service.dataSource.transaction.mockImplementation(async (work: (value: typeof manager) => unknown) =>
            work(manager),
        )

        await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).resolves.toEqual({ ok: true, id: TARGET_ID })

        for (const entity of repositories.keys()) expect(manager.getRepository).toHaveBeenCalledWith(entity)
        expect(repositories.get(User)!.update).toHaveBeenCalledWith(
            { referredByUserId: TARGET_ID },
            { referredByUserId: null },
        )
        expect(repositories.get(User)!.delete).toHaveBeenLastCalledWith(TARGET_ID)
        for (const entity of [
            Subscription,
            SubscriptionRenewal,
            SubscriptionBalance,
            VpnAccess,
            AccessOperationLog,
            Payment,
            PaymentAttempt,
            PaymentAdminNotification,
            PaymentWebhookEvent,
            PlategaRecurrentAgreement,
            ReferralBonusLedger,
            PromoUsage,
            SupportMessage,
            SupportThread,
            TelegramAuthRequest,
            TelegramSiteLinkRequest,
            UserAttribution,
            AnalyticsEvent,
        ])
            expect(repositories.get(entity)!.delete).toHaveBeenCalled()
        expect(service.userRepository).not.toHaveProperty('delete')
    })

    it('propagates a child deletion failure so DataSource can roll the transaction back', async () => {
        const failure = new Error('payment child delete failed')
        const paymentAttemptRepository = repositoryMock()
        paymentAttemptRepository.delete.mockRejectedValue(failure)
        const repositories = new Map<unknown, ReturnType<typeof repositoryMock>>([
            [User, repositoryMock()],
            [Subscription, repositoryMock()],
            [VpnAccess, repositoryMock()],
            [Payment, repositoryMock()],
            [PaymentAttempt, paymentAttemptRepository],
        ])
        repositories.get(User)!.findOne.mockResolvedValue({ id: TARGET_ID, telegramId: null })
        repositories.get(Subscription)!.find.mockResolvedValue([{ id: SUBSCRIPTION_ID }])
        repositories.get(VpnAccess)!.find.mockResolvedValue([])
        repositories.get(Payment)!.find.mockResolvedValue([{ id: PAYMENT_ID }])
        const manager = { getRepository: jest.fn((entity: unknown) => repositories.get(entity) || repositoryMock()) }
        const service = createService()
        service.dataSource.transaction.mockImplementation(async (work: (value: typeof manager) => unknown) =>
            work(manager),
        )

        await expect(service.permanentlyDeleteUser(TARGET_ID, ACTOR_ID)).rejects.toBe(failure)
        expect(repositories.get(User)!.delete).not.toHaveBeenCalled()
    })
})

describe('SubscriptionLifecycleOrchestrator stop coverage', () => {
    it('revokes PENDING/ERROR access through the same idempotent provider path', async () => {
        const orchestrator = Object.create(SubscriptionLifecycleOrchestrator.prototype) as any
        const access = {
            id: ACCESS_ID,
            serverNodeId: '88888888-8888-4888-8888-888888888888',
            inboundKey: 'fixture',
            providerExternalId: 'fixture-external',
            providerClientKey: 'fixture-client',
        }
        orchestrator.operationService = {
            begin: jest.fn().mockResolvedValue({ isNew: true, existing: { status: 'STARTED' } }),
            succeed: jest.fn(),
            fail: jest.fn(),
        }
        orchestrator.subscriptionRepository = {
            findOneOrFail: jest.fn().mockResolvedValue({ id: SUBSCRIPTION_ID, status: StatusesEnum.PENDING }),
            save: jest.fn(async (value) => value),
        }
        orchestrator.vpnAccessService = {
            findProvisionableBySubscription: jest.fn().mockResolvedValue(access),
            markDisabled: jest.fn(),
            markError: jest.fn(),
        }
        orchestrator.serverNodeResolver = {
            resolveNode: jest.fn().mockResolvedValue({ baseUrl: 'https://example.test' }),
        }
        orchestrator.remnawaveProvider = { disableAccess: jest.fn().mockResolvedValue({ isActive: false }) }

        await orchestrator.stopSubscription({ subscriptionId: SUBSCRIPTION_ID, operationKey: 'fixture-stop' })

        expect(orchestrator.vpnAccessService.findProvisionableBySubscription).toHaveBeenCalledWith(SUBSCRIPTION_ID)
        expect(orchestrator.remnawaveProvider.disableAccess).toHaveBeenCalledTimes(1)
        expect(orchestrator.vpnAccessService.markDisabled).toHaveBeenCalledWith(ACCESS_ID, 'Stopped by user/admin')
    })
})
