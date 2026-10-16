import { PaymentPromoLifecycleService } from './payment-promo-lifecycle.service'
import { Payment } from '../../payment/entity/payment.entity'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { PromoUsage, PromoUsageStatusEnum } from '../entity/promo-usage.entity'
import { PromoLifecycleError } from '../errors/promo-lifecycle.error'

describe('PaymentPromoLifecycleService', () => {
    const appliedAt = new Date('2026-07-29T12:00:00.000Z')

    function createHarness(input?: { payment?: any; usage?: any; subscription?: any }) {
        const payment =
            input?.payment === undefined
                ? {
                      id: 'payment-1',
                      userId: 'user-1',
                      subscriptionId: 'subscription-1',
                      status: PaymentStatusEnum.SUCCEEDED,
                      metadataSnapshot: { promo_id: 'promo-1' },
                  }
                : input.payment
        const usage =
            input?.usage === undefined
                ? {
                      promoCodeId: 'promo-1',
                      userId: 'user-1',
                      status: PromoUsageStatusEnum.RESERVED,
                      appliedAt: null,
                  }
                : input.usage
        const subscription =
            input?.subscription === undefined
                ? { id: 'subscription-1', userId: 'user-1', sourcePromoCodeId: null }
                : input.subscription
        const locks: string[] = []
        const saved: any[] = []
        const rows = new Map<any, any>([
            [Payment, payment],
            [PromoUsage, usage],
            [Subscription, subscription],
        ])
        const manager = {
            getRepository: jest.fn((entity: any) => {
                const repository = {
                    createQueryBuilder: jest.fn(() => ({
                        setLock: jest.fn(function (this: any, lock: string) {
                            locks.push(lock)
                            return this
                        }),
                        where: jest.fn(function (this: any) {
                            return this
                        }),
                        andWhere: jest.fn(function (this: any) {
                            return this
                        }),
                        getOne: jest.fn(async () => rows.get(entity)),
                    })),
                    save: jest.fn(async (value: any) => {
                        saved.push(value)
                        return value
                    }),
                }
                return repository
            }),
            save: jest.fn(async (entity: any) => {
                saved.push(entity)
                return entity
            }),
        }

        return {
            service: new PaymentPromoLifecycleService(),
            manager: manager as any,
            payment,
            usage,
            subscription,
            locks,
            saved,
        }
    }

    it('applies a reserved usage and links the subscription under pessimistic locks', async () => {
        const harness = createHarness()

        await expect(
            harness.service.finalizeSuccessfulPayment(harness.manager, {
                paymentId: 'payment-1',
                userId: 'user-1',
                promoCodeId: 'promo-1',
                subscriptionId: 'subscription-1',
                appliedAt,
            }),
        ).resolves.toEqual({ status: 'APPLIED' })

        expect(harness.usage).toMatchObject({ status: PromoUsageStatusEnum.APPLIED, appliedAt })
        expect(harness.subscription.sourcePromoCodeId).toBe('promo-1')
        expect(harness.saved).toEqual([harness.subscription, harness.usage])
        expect(harness.locks).toEqual(['pessimistic_write', 'pessimistic_write', 'pessimistic_write'])
    })

    it('is a strict no-op when finalize is repeated', async () => {
        const originalAppliedAt = new Date('2026-07-28T12:00:00.000Z')
        const harness = createHarness({
            usage: {
                promoCodeId: 'promo-1',
                userId: 'user-1',
                status: PromoUsageStatusEnum.APPLIED,
                appliedAt: originalAppliedAt,
            },
            subscription: { id: 'subscription-1', userId: 'user-1', sourcePromoCodeId: 'promo-1' },
        })

        await expect(
            harness.service.finalizeSuccessfulPayment(harness.manager, {
                paymentId: 'payment-1',
                userId: 'user-1',
                promoCodeId: 'promo-1',
                subscriptionId: 'subscription-1',
                appliedAt,
            }),
        ).resolves.toEqual({ status: 'ALREADY_APPLIED' })
        expect(harness.usage.appliedAt).toBe(originalAppliedAt)
        expect(harness.saved).toEqual([])
    })

    it('replaces the previous subscription promo with the new successful payment promo exactly once', async () => {
        const originalAppliedAt = new Date('2026-07-28T12:00:00.000Z')
        const harness = createHarness({
            payment: {
                id: 'payment-b',
                userId: 'user-1',
                subscriptionId: 'subscription-1',
                status: PaymentStatusEnum.SUCCEEDED,
                metadataSnapshot: { promo_id: 'promo-b' },
            },
            usage: {
                promoCodeId: 'promo-b',
                userId: 'user-1',
                status: PromoUsageStatusEnum.RESERVED,
                appliedAt: null,
            },
            subscription: { id: 'subscription-1', userId: 'user-1', sourcePromoCodeId: 'promo-a' },
        })
        const input = {
            paymentId: 'payment-b',
            userId: 'user-1',
            promoCodeId: 'promo-b',
            subscriptionId: 'subscription-1',
            appliedAt,
        }

        await expect(harness.service.finalizeSuccessfulPayment(harness.manager, input)).resolves.toEqual({ status: 'APPLIED' })
        expect(harness.subscription.sourcePromoCodeId).toBe('promo-b')
        expect(harness.usage).toMatchObject({ status: PromoUsageStatusEnum.APPLIED, appliedAt })

        await expect(
            harness.service.finalizeSuccessfulPayment(harness.manager, { ...input, appliedAt: originalAppliedAt }),
        ).resolves.toEqual({ status: 'ALREADY_APPLIED' })
        expect(harness.subscription.sourcePromoCodeId).toBe('promo-b')
        expect(harness.usage.appliedAt).toBe(appliedAt)
        expect(harness.saved).toEqual([harness.subscription, harness.usage])
    })

    it('keeps the previous subscription promo when the new payment usage is canceled', async () => {
        const harness = createHarness({
            payment: {
                id: 'payment-b',
                userId: 'user-1',
                subscriptionId: 'subscription-1',
                status: PaymentStatusEnum.SUCCEEDED,
                metadataSnapshot: { promo_id: 'promo-b' },
            },
            usage: {
                promoCodeId: 'promo-b',
                userId: 'user-1',
                status: PromoUsageStatusEnum.CANCELED,
                appliedAt: null,
            },
            subscription: { id: 'subscription-1', userId: 'user-1', sourcePromoCodeId: 'promo-a' },
        })

        await expect(
            harness.service.finalizeSuccessfulPayment(harness.manager, {
                paymentId: 'payment-b',
                userId: 'user-1',
                promoCodeId: 'promo-b',
                subscriptionId: 'subscription-1',
                appliedAt,
            }),
        ).rejects.toMatchObject({ code: 'PROMO_LIFECYCLE_USAGE_CANCELED' })
        expect(harness.subscription.sourcePromoCodeId).toBe('promo-a')
        expect(harness.saved).toEqual([])
    })

    it.each([
        ['missing payment', { payment: null }, 'PROMO_LIFECYCLE_PAYMENT_NOT_FOUND'],
        [
            'payment user mismatch',
            {
                payment: {
                    id: 'payment-1',
                    userId: 'other',
                    status: PaymentStatusEnum.SUCCEEDED,
                    metadataSnapshot: { promo_id: 'promo-1' },
                },
            },
            'PROMO_LIFECYCLE_PAYMENT_MISMATCH',
        ],
        ['missing usage', { usage: null }, 'PROMO_LIFECYCLE_USAGE_NOT_FOUND'],
        [
            'canceled usage',
            { usage: { promoCodeId: 'promo-1', userId: 'user-1', status: PromoUsageStatusEnum.CANCELED } },
            'PROMO_LIFECYCLE_USAGE_CANCELED',
        ],
        [
            'subscription user mismatch',
            { subscription: { id: 'subscription-1', userId: 'other', sourcePromoCodeId: null } },
            'PROMO_LIFECYCLE_SUBSCRIPTION_MISMATCH',
        ],
    ])('fails closed for %s', async (_label, patch, code) => {
        const harness = createHarness(patch)
        const promise = harness.service.finalizeSuccessfulPayment(harness.manager, {
            paymentId: 'payment-1',
            userId: 'user-1',
            promoCodeId: 'promo-1',
            subscriptionId: 'subscription-1',
            appliedAt,
        })

        await expect(promise).rejects.toMatchObject({ code })
        await expect(promise).rejects.toBeInstanceOf(PromoLifecycleError)
    })

    it.each([
        [PromoUsageStatusEnum.RESERVED, 'CANCELED', PromoUsageStatusEnum.CANCELED],
        [PromoUsageStatusEnum.CANCELED, 'ALREADY_CANCELED', PromoUsageStatusEnum.CANCELED],
        [PromoUsageStatusEnum.APPLIED, 'ALREADY_APPLIED', PromoUsageStatusEnum.APPLIED],
    ])('cancels %s idempotently', async (initialStatus, resultStatus, finalStatus) => {
        const harness = createHarness({
            usage: { promoCodeId: 'promo-1', userId: 'user-1', status: initialStatus, appliedAt: null },
            payment: {
                id: 'payment-1',
                userId: 'user-1',
                status: PaymentStatusEnum.CANCELED,
                metadataSnapshot: { promo_id: 'promo-1' },
            },
        })

        await expect(
            harness.service.cancelFailedPayment(harness.manager, {
                paymentId: 'payment-1',
                userId: 'user-1',
                promoCodeId: 'promo-1',
                canceledAt: appliedAt,
            }),
        ).resolves.toEqual({ status: resultStatus })
        expect(harness.usage.status).toBe(finalStatus)
    })

    it('treats a missing usage as a safe cancel no-op only when the payment has no promo', async () => {
        const harness = createHarness({
            payment: {
                id: 'payment-1',
                userId: 'user-1',
                status: PaymentStatusEnum.CANCELED,
                metadataSnapshot: {},
            },
            usage: null,
        })

        await expect(
            harness.service.cancelFailedPayment(harness.manager, {
                paymentId: 'payment-1',
                userId: 'user-1',
                promoCodeId: 'promo-1',
                canceledAt: appliedAt,
            }),
        ).resolves.toEqual({ status: 'ALREADY_CANCELED' })
    })
})
