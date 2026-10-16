import { PaymentCanonicalProcessingService } from './payment-canonical-processing.service'
import { PaymentAdminNotification } from '../entity/payment-admin-notification.entity'
import { Payment } from '../entity/payment.entity'
import { PaymentActivationStatus } from '../enum/payment-activation-status.enum'
import { PaymentAdminNotificationStatus } from '../enum/payment-admin-notification-status.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentMethodConsentSource } from '../types/payment-method-consent-source'

describe('PaymentCanonicalProcessingService canonical validation', () => {
    const config = { get: jest.fn() }
    const service = new PaymentCanonicalProcessingService(
        {} as any,
        config as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
    )
    const payment = {
        id: 'local-1',
        provider: 'yookassa',
        merchant: PaymentMerchant.SITE,
        providerPaymentId: 'yk-1',
        amount: 399,
        subscriptionId: 'sub-1',
        planId: 'plan-1',
    } as any
    const canonical = {
        provider: PaymentProvider.YOOKASSA,
        merchant: PaymentMerchant.SITE,
        providerPaymentId: 'yk-1',
        status: PaymentStatusEnum.SUCCEEDED,
        externalStatus: 'succeeded',
        confirmationUrl: null,
        providerInvoiceId: null,
        amountValue: '399.00',
        currency: 'RUB',
        metadata: {
            local_payment_id: 'local-1',
            subscription_id: 'sub-1',
            plan_id: 'plan-1',
            merchant: PaymentMerchant.SITE,
        },
        paymentMethod: null,
        safeResponseSnapshot: {},
    } as any

    it('accepts the matching merchant-scoped canonical object', () => {
        expect(() => (service as any).validateCanonical(payment, PaymentMerchant.SITE, canonical)).not.toThrow()
    })

    it.each([
        ['provider id', { providerPaymentId: 'forged' }],
        ['amount', { amountValue: '398.99' }],
        ['currency', { currency: 'USD' }],
        ['canonical merchant', { merchant: PaymentMerchant.BOT }],
        ['local id metadata', { metadata: { ...canonical.metadata, local_payment_id: 'other' } }],
        ['subscription metadata', { metadata: { ...canonical.metadata, subscription_id: 'other' } }],
        ['plan metadata', { metadata: { ...canonical.metadata, plan_id: 'other' } }],
        ['merchant metadata', { metadata: { ...canonical.metadata, merchant: PaymentMerchant.BOT } }],
    ])('rejects %s mismatch', (_label, patch) => {
        expect(() =>
            (service as any).validateCanonical(payment, PaymentMerchant.SITE, { ...canonical, ...patch }),
        ).toThrow()
    })

    it.each([
        ['recurrent payments are disabled', 'false', true, true, false],
        ['legacy metadata lacks consent source', 'true', false, true, false],
        ['the provider did not confirm a saved method', 'true', true, false, false],
        ['conditional consent and provider confirmation are present', 'true', true, true, true],
    ])('persists a YooKassa method only when %s', (_label, recurrentEnabled, requested, providerSaved, expected) => {
        config.get.mockImplementation((key: string) =>
            key === 'PAYMENT_RECURRENT_ENABLED' ? recurrentEnabled : undefined,
        )
        const candidatePayment = {
            ...payment,
            metadataSnapshot: requested
                ? { payment_method_consent_source: PaymentMethodConsentSource.YOOKASSA_CONDITIONAL }
                : {},
        }
        const candidateCanonical = {
            ...canonical,
            paymentMethod: { id: 'method-1', saved: providerSaved, type: 'bank_card' },
        }

        expect((service as any).shouldPersistPaymentMethod(candidatePayment, candidateCanonical)).toBe(expected)
    })

    it('does not persist a missing provider payment method', () => {
        config.get.mockReturnValue('true')
        expect(
            (service as any).shouldPersistPaymentMethod(
                {
                    ...payment,
                    metadataSnapshot: {
                        payment_method_consent_source: PaymentMethodConsentSource.YOOKASSA_CONDITIONAL,
                    },
                },
                { ...canonical, paymentMethod: null },
            ),
        ).toBe(false)
    })

    it('never persists a saved YooKassa method for ONE_TIME NONE consent, even if legacy recurrence is enabled', () => {
        config.get.mockReturnValue('true')
        expect(
            (service as any).shouldPersistPaymentMethod(
                {
                    ...payment,
                    metadataSnapshot: { payment_method_consent_source: PaymentMethodConsentSource.NONE },
                },
                { ...canonical, paymentMethod: { id: 'method-1', saved: true, type: 'bank_card' } },
            ),
        ).toBe(false)
    })

    it('finalizes a BOT payment promo inside the canonical success transaction before processedAt and not on duplicate reconcile', async () => {
        const localPayment = {
            ...payment,
            merchant: PaymentMerchant.BOT,
            userId: 'user-1',
            status: PaymentStatusEnum.PENDING,
            processedAt: null,
            metadataSnapshot: { promo_id: 'promo-b', promo_duration_days: 45 },
            activationStatus: null,
            isRecurring: false,
        } as any
        const subscription = {
            id: 'sub-1',
            userId: 'user-1',
            startAt: new Date(),
            endsAt: new Date(),
            sourcePromoCodeId: 'promo-a',
        } as any
        const usage = { promoCodeId: 'promo-b', userId: 'user-1', status: 'reserved', appliedAt: null }
        const lifecycle = {
            finalizeSuccessfulPayment: jest.fn(async (_manager, input) => {
                expect(localPayment.status).toBe(PaymentStatusEnum.SUCCEEDED)
                expect(localPayment.processedAt).toBeNull()
                expect(input).toMatchObject({
                    paymentId: 'local-1',
                    userId: 'user-1',
                    promoCodeId: 'promo-b',
                    subscriptionId: 'sub-1',
                })
                if (usage.status === 'reserved') {
                    usage.status = 'applied'
                    usage.appliedAt = input.appliedAt
                }
                if (subscription.sourcePromoCodeId !== input.promoCodeId) {
                    subscription.sourcePromoCodeId = input.promoCodeId
                }
            }),
            cancelFailedPayment: jest.fn(),
        }
        const enqueuedNotifications: any[] = []
        const manager: any = {
            getRepository: jest.fn((entity: any) => {
                if (entity === Payment) {
                    return {
                        createQueryBuilder: () => ({
                            setLock() {
                                return this
                            },
                            where() {
                                return this
                            },
                            getOneOrFail: async () => localPayment,
                        }),
                    }
                }
                if (entity === 'subscriptions') {
                    return {
                        createQueryBuilder: () => ({
                            setLock() {
                                return this
                            },
                            where() {
                                return this
                            },
                            getOne: async () => subscription,
                        }),
                    }
                }
                if (entity === 'plans') {
                    return { findOneByOrFail: async () => ({ id: 'plan-1', period: 30 }) }
                }
                if (entity === PaymentAdminNotification) {
                    return {
                        createQueryBuilder: () => ({
                            insert() {
                                return this
                            },
                            into() {
                                return this
                            },
                            values(value: any) {
                                enqueuedNotifications.push(value)
                                return this
                            },
                            orIgnore() {
                                return this
                            },
                            execute: jest.fn(async () => ({ identifiers: [] })),
                        }),
                    }
                }
                return { findOne: jest.fn(), findOneByOrFail: jest.fn() }
            }),
            save: jest.fn(async (_entity: any, value?: any) => value || _entity),
        }
        const payments = {
            createQueryBuilder: () => ({
                update() {
                    return this
                },
                set() {
                    return this
                },
                where() {
                    return this
                },
                andWhere() {
                    return this
                },
                execute: async () => ({ affected: 0 }),
            }),
            findOneOrFail: jest.fn(async () => localPayment),
        }
        const instance = new PaymentCanonicalProcessingService(
            { transaction: (work: any) => work(manager) } as any,
            config as any,
            {} as any,
            {} as any,
            lifecycle as any,
            payments as any,
            {} as any,
            {} as any,
        )

        await instance.processCanonicalPayment({
            paymentId: 'local-1',
            merchant: PaymentMerchant.BOT,
            canonical: {
                ...canonical,
                merchant: PaymentMerchant.BOT,
                metadata: { ...canonical.metadata, merchant: PaymentMerchant.BOT },
            },
            source: 'WEBHOOK',
        })
        await instance.processCanonicalPayment({
            paymentId: 'local-1',
            merchant: PaymentMerchant.BOT,
            canonical: {
                ...canonical,
                merchant: PaymentMerchant.BOT,
                metadata: { ...canonical.metadata, merchant: PaymentMerchant.BOT },
            },
            source: 'RECONCILIATION',
        })

        expect(lifecycle.finalizeSuccessfulPayment).toHaveBeenCalledTimes(1)
        expect(usage).toMatchObject({ status: 'applied', appliedAt: expect.any(Date) })
        expect(subscription.sourcePromoCodeId).toBe('promo-b')
        expect(localPayment.processedAt).toBeInstanceOf(Date)
        expect(manager.getRepository).toHaveBeenCalledWith(PaymentAdminNotification)
        expect(enqueuedNotifications).toEqual([
            expect.objectContaining({
                paymentId: 'local-1',
                status: PaymentAdminNotificationStatus.PENDING,
            }),
        ])
    })

    it('cancels a reserved promo inside the canonical canceled transaction', async () => {
        const localPayment = {
            ...payment,
            userId: 'user-1',
            status: PaymentStatusEnum.PENDING,
            metadataSnapshot: { promo_id: 'promo-1' },
            isRecurring: false,
        } as any
        const lifecycle = {
            finalizeSuccessfulPayment: jest.fn(),
            cancelFailedPayment: jest.fn(async () => ({ status: 'CANCELED' })),
        }
        const manager: any = {
            getRepository: jest.fn(() => ({
                createQueryBuilder: () => ({
                    setLock() {
                        return this
                    },
                    where() {
                        return this
                    },
                    getOneOrFail: async () => localPayment,
                }),
            })),
            save: jest.fn(async (value: any) => value),
        }
        const payments = {
            findOneOrFail: jest.fn(async () => localPayment),
        }
        const instance = new PaymentCanonicalProcessingService(
            { transaction: (work: any) => work(manager) } as any,
            config as any,
            {} as any,
            {} as any,
            lifecycle as any,
            payments as any,
            {} as any,
            {} as any,
        )

        await instance.processCanonicalPayment({
            paymentId: 'local-1',
            merchant: PaymentMerchant.SITE,
            canonical: { ...canonical, status: PaymentStatusEnum.CANCELED, externalStatus: 'canceled' },
            source: 'WEBHOOK',
        })

        expect(lifecycle.cancelFailedPayment).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                paymentId: 'local-1',
                userId: 'user-1',
                promoCodeId: 'promo-1',
            }),
        )
        expect(manager.getRepository).not.toHaveBeenCalledWith(PaymentAdminNotification)
    })

    it.each([
        [
            'actual bank-card provider income',
            {
                incomeAmount: { value: '900.00', currency: 'RUB' },
                paymentMethod: { type: 'bank_card' },
            },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '100.00',
                rewardAmountRub: '430.00',
                calculationVersion: 'net-v3-actual-income',
            },
        ],
        [
            'missing bank-card income',
            { paymentMethod: { type: 'bank_card' } },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '35.00',
                rewardAmountRub: '462.50',
                calculationVersion: 'net-v3-fallback-7_5',
            },
        ],
        [
            'actual SBP provider income',
            {
                incomeAmount: { value: '965.00', currency: 'RUB' },
                paymentMethod: { type: 'sbp' },
            },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '35.00',
                rewardAmountRub: '462.50',
                calculationVersion: 'net-v3-actual-income',
            },
        ],
        [
            'missing SBP income',
            { paymentMethod: { type: 'sbp' } },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '35.00',
                rewardAmountRub: '462.50',
                calculationVersion: 'net-v3-fallback-7_5',
            },
        ],
        [
            'actual unknown-method provider income',
            {
                incomeAmount: { value: '990.00', currency: 'RUB' },
                paymentMethod: { type: 'cash_like_future_method' },
            },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '10.00',
                rewardAmountRub: '475.00',
                calculationVersion: 'net-v3-actual-income',
            },
        ],
        [
            'missing unknown-method income',
            { paymentMethod: { type: 'cash_like_future_method' } },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '35.00',
                rewardAmountRub: '462.50',
                calculationVersion: 'net-v3-fallback-7_5',
            },
        ],
        [
            'malformed provider income',
            {
                incomeAmount: { value: 'not-a-number', currency: 'RUB' },
                paymentMethod: { type: 'sbp' },
            },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '35.00',
                rewardAmountRub: '462.50',
                calculationVersion: 'net-v3-fallback-7_5',
            },
        ],
        [
            'provider income greater than gross',
            {
                incomeAmount: { value: '1000.01', currency: 'RUB' },
                paymentMethod: { type: 'bank_card' },
            },
            {
                status: 'CALCULATED',
                providerFeeAmountRub: '35.00',
                rewardAmountRub: '462.50',
                calculationVersion: 'net-v3-fallback-7_5',
            },
        ],
    ])('keeps activation successful with %s referral calculation', async (_label, snapshot, expected) => {
        const localPayment = {
            ...payment,
            amount: 1000,
            paidAt: new Date('2026-08-16T10:00:00.000Z'),
            metadataSnapshot: { canonical: snapshot },
            activationStatus: 'PENDING',
            activationAttemptCount: 1,
        } as any
        const execute = jest.fn().mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 1 })
        const payments = {
            createQueryBuilder: () => ({
                update() {
                    return this
                },
                set() {
                    return this
                },
                where() {
                    return this
                },
                andWhere() {
                    return this
                },
                execute,
            }),
            findOneOrFail: jest.fn(async () => localPayment),
        }
        const orchestrator = { activatePaidSubscription: jest.fn(async () => ({})) }
        const instance = new PaymentCanonicalProcessingService(
            {} as any,
            config as any,
            {} as any,
            orchestrator as any,
            {} as any,
            payments as any,
            {} as any,
            {} as any,
        )

        await expect(instance.reconcileActivation(localPayment.id)).resolves.toBeUndefined()
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledWith(
            expect.objectContaining({ referralRewardCalculation: expect.objectContaining(expected) }),
        )
        expect(execute).toHaveBeenCalledTimes(2)
    })

    it('uses a trusted Platega recurrent paid-through boundary instead of frozen duration arithmetic', async () => {
        const subscription = {
            id: 'sub-1',
            startAt: new Date('2026-01-01T00:00:00Z'),
            endsAt: new Date('2026-02-01T00:00:00Z'),
        }
        const manager = {
            getRepository: jest.fn((name: string) => {
                if (name === 'subscriptions') {
                    return {
                        createQueryBuilder: () => ({
                            setLock: () => ({
                                where: () => ({ getOne: async () => subscription }),
                            }),
                        }),
                    }
                }
                return { findOneByOrFail: async () => ({ id: 'plan-1', period: 30 }) }
            }),
            save: jest.fn(),
        }
        const recurrentPayment = {
            ...payment,
            paidAt: new Date('2027-01-31T00:00:00Z'),
            isRecurring: true,
            provider: 'platega',
            metadataSnapshot: { recurrent_duration_days: 90, promo_duration_days: 45 },
        } as any

        const providerBoundary = new Date('2027-02-28T00:00:00Z')
        await (service as any).applyLocalPaidState(manager, recurrentPayment, { paidThroughAt: providerBoundary })

        expect(subscription.endsAt).toEqual(providerBoundary)
    })

    it('uses the provider leap-year yearly boundary exactly and leaves ordinary one-time 360-day arithmetic intact', async () => {
        const recurrentSubscription = { id: 'sub-1', startAt: new Date('2027-02-28Z'), endsAt: new Date('2028-02-28Z') }
        const oneTimeSubscription = { id: 'sub-2', startAt: null, endsAt: null }
        const manager = {
            getRepository: jest.fn((name: string) => {
                if (name === 'subscriptions') {
                    return {
                        createQueryBuilder: () => ({
                            setLock: () => ({
                                where: (_query: any, params: any) => ({
                                    getOne: async () =>
                                        params.id === 'sub-1' ? recurrentSubscription : oneTimeSubscription,
                                }),
                            }),
                        }),
                    }
                }
                return { findOneByOrFail: async () => ({ id: 'plan-1', period: 360 }) }
            }),
            save: jest.fn(),
        }
        await (service as any).applyLocalPaidState(
            manager,
            { ...payment, subscriptionId: 'sub-1', provider: 'platega', isRecurring: true, paidAt: new Date('2028-02-28Z') },
            { paidThroughAt: new Date('2028-02-29T00:00:00Z') },
        )
        await (service as any).applyLocalPaidState(manager, {
            ...payment,
            subscriptionId: 'sub-2',
            provider: 'yookassa',
            isRecurring: false,
            paidAt: new Date('2027-01-01T00:00:00Z'),
            metadataSnapshot: {},
        })
        expect(recurrentSubscription.endsAt).toEqual(new Date('2028-02-29T00:00:00Z'))
        const oneTimeExpected = new Date('2027-01-01T00:00:00Z')
        oneTimeExpected.setDate(oneTimeExpected.getDate() + 360)
        expect(oneTimeSubscription.endsAt).toEqual(oneTimeExpected)
    })

    it('applies one Platega recurrent charge local state once across sequential callback retries', async () => {
        const localPayment = {
            id: 'payment-platega-1',
            provider: 'platega',
            merchant: PaymentMerchant.SITE,
            isRecurring: true,
            status: PaymentStatusEnum.PENDING,
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            amount: 500,
            providerPaymentId: 'charge-1',
            metadataSnapshot: { recurrent_duration_days: 30 },
            processedAt: null,
            activationStatus: null,
        } as any
        const subscription = { id: 'sub-1', startAt: new Date('2026-01-01Z'), endsAt: new Date('2026-02-01Z') }
        const manager: any = {
            getRepository: jest.fn((entity: any) => {
                if (entity === Payment)
                    return {
                        createQueryBuilder: () => ({
                            setLock() {
                                return this
                            },
                            where() {
                                return this
                            },
                            getOneOrFail: async () => localPayment,
                        }),
                    }
                if (entity === 'subscriptions')
                    return {
                        createQueryBuilder: () => ({
                            setLock() {
                                return this
                            },
                            where() {
                                return this
                            },
                            getOne: async () => subscription,
                        }),
                    }
                if (entity === 'plans') return { findOneByOrFail: async () => ({ id: 'plan-1', period: 90 }) }
                if (entity === PaymentAdminNotification)
                    return {
                        createQueryBuilder: () => ({
                            insert() {
                                return this
                            },
                            into() {
                                return this
                            },
                            values() {
                                return this
                            },
                            orIgnore() {
                                return this
                            },
                            execute: async () => ({}),
                        }),
                    }
                return {}
            }),
            save: jest.fn(async (value: any) => value),
        }
        const instance = new PaymentCanonicalProcessingService(
            { transaction: (work: any) => work(manager) } as any,
            config as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        )
        jest.spyOn(instance, 'reconcileActivation').mockResolvedValue(undefined)

        const paidThroughAt = new Date('2027-03-01T00:00:00Z')
        await instance.processConfirmedPlategaRecurrentCharge(localPayment.id, paidThroughAt)
        const firstEndsAt = subscription.endsAt
        await instance.processConfirmedPlategaRecurrentCharge(localPayment.id, paidThroughAt)

        expect(subscription.endsAt).toEqual(firstEndsAt)
        expect(manager.getRepository).toHaveBeenCalledWith(PaymentAdminNotification)
        expect(instance.reconcileActivation).toHaveBeenCalledTimes(2)
    })

    describe('Platega recurrent paid-through monotonicity', () => {
        function createRecurrentFixture(existingEndsAt: Date) {
            const localPayment = {
                id: 'payment-monotonic-1',
                provider: 'platega',
                merchant: PaymentMerchant.SITE,
                isRecurring: true,
                status: PaymentStatusEnum.PENDING,
                subscriptionId: 'sub-monotonic-1',
                planId: 'plan-1',
                amount: 500,
                providerPaymentId: 'charge-monotonic-1',
                metadataSnapshot: {},
                processedAt: null,
                activationStatus: null,
                paidAt: null,
            } as any
            const subscription = {
                id: 'sub-monotonic-1',
                startAt: new Date('2030-01-01T00:00:00Z'),
                endsAt: new Date(existingEndsAt),
                nextPayAt: new Date(existingEndsAt),
            } as any
            const manager: any = {
                getRepository: jest.fn((entity: any) => {
                    if (entity === Payment) return { createQueryBuilder: () => ({ setLock: () => ({ where: () => ({ getOneOrFail: async () => localPayment }) }) }) }
                    if (entity === 'subscriptions') return { createQueryBuilder: () => ({ setLock: () => ({ where: () => ({ getOne: async () => subscription }) }) }) }
                    if (entity === 'plans') return { findOneByOrFail: async () => ({ id: 'plan-1', period: 30 }) }
                    if (entity === PaymentAdminNotification) return {
                        createQueryBuilder: () => ({
                            insert() { return this }, into() { return this }, values() { return this }, orIgnore() { return this },
                            execute: async () => ({}),
                        }),
                    }
                    return {}
                }),
                save: jest.fn(async (value: any) => value),
            }
            const paymentSnapshot = { status: localPayment.status, processedAt: localPayment.processedAt, activationStatus: localPayment.activationStatus, paidAt: localPayment.paidAt }
            const subscriptionSnapshot = { endsAt: new Date(subscription.endsAt), nextPayAt: new Date(subscription.nextPayAt) }
            const instance = new PaymentCanonicalProcessingService(
                {
                    transaction: async (work: any) => {
                        try {
                            return await work(manager)
                        } catch (error) {
                            Object.assign(localPayment, paymentSnapshot)
                            Object.assign(subscription, subscriptionSnapshot)
                            throw error
                        }
                    },
                } as any,
                config as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
            )
            jest.spyOn(instance, 'reconcileActivation').mockResolvedValue(undefined)
            return { instance, localPayment, subscription, manager }
        }

        it.each([
            ['earlier', new Date('2031-06-01T00:00:00Z'), new Date('2031-05-01T00:00:00Z')],
            ['equal', new Date('2031-06-01T00:00:00Z'), new Date('2031-06-01T00:00:00Z')],
        ])('rejects a %s future boundary without persisting paid state', async (_label, existingEndsAt, paidThroughAt) => {
            const { instance, localPayment, subscription } = createRecurrentFixture(existingEndsAt)

            await expect(instance.processConfirmedPlategaRecurrentCharge(localPayment.id, paidThroughAt)).rejects.toThrow(
                'Recurrent paid-through boundary must strictly advance existing access',
            )

            expect(subscription.endsAt).toEqual(existingEndsAt)
            expect(subscription.nextPayAt).toEqual(existingEndsAt)
            expect(localPayment.status).toBe(PaymentStatusEnum.PENDING)
            expect(localPayment.processedAt).toBeNull()
            expect(instance.reconcileActivation).not.toHaveBeenCalled()
        })

        it('writes a strictly forward provider boundary exactly without local duration arithmetic', async () => {
            const existingEndsAt = new Date('2031-06-01T00:00:00Z')
            const paidThroughAt = new Date('2031-07-01T00:00:00Z')
            const { instance, localPayment, subscription } = createRecurrentFixture(existingEndsAt)

            await expect(instance.processConfirmedPlategaRecurrentCharge(localPayment.id, paidThroughAt)).resolves.toEqual({ ok: true })

            expect(subscription.endsAt).toEqual(paidThroughAt)
            expect(subscription.nextPayAt).toEqual(paidThroughAt)
            expect(localPayment.status).toBe(PaymentStatusEnum.SUCCEEDED)
            expect(localPayment.processedAt).toBeInstanceOf(Date)
            expect(instance.reconcileActivation).toHaveBeenCalledWith(localPayment.id)
        })

        function createProcessedFixture(storedBoundary: string | undefined) {
            const fixture = createRecurrentFixture(new Date('2031-06-01T00:00:00Z'))
            fixture.localPayment.processedAt = new Date('2031-06-01T01:00:00Z')
            fixture.localPayment.activationStatus = PaymentActivationStatus.SUCCEEDED
            fixture.localPayment.status = PaymentStatusEnum.SUCCEEDED
            fixture.localPayment.metadataSnapshot = storedBoundary === undefined
                ? {}
                : { platega_recurrent_paid_through_at: storedBoundary }
            return fixture
        }

        it('accepts an already processed charge with the same boundary instant and does not reapply access', async () => {
            const paidThroughAt = new Date('2031-07-01T00:00:00Z')
            const { instance, localPayment, subscription, manager } = createProcessedFixture('2031-07-01T00:00:00+00:00')

            await expect(instance.processConfirmedPlategaRecurrentCharge(localPayment.id, paidThroughAt)).resolves.toEqual({ ok: true })

            expect(subscription.endsAt).toEqual(new Date('2031-06-01T00:00:00Z'))
            expect(subscription.nextPayAt).toEqual(new Date('2031-06-01T00:00:00Z'))
            expect(manager.save).not.toHaveBeenCalled()
            expect(instance.reconcileActivation).not.toHaveBeenCalled()
        })

        it('rejects an already processed charge when the incoming boundary differs', async () => {
            const { instance, localPayment, subscription, manager } = createProcessedFixture('2031-07-01T00:00:00.000Z')

            await expect(
                instance.processConfirmedPlategaRecurrentCharge(localPayment.id, new Date('2031-08-01T00:00:00Z')),
            ).rejects.toThrow('Processed recurrent charge paid-through boundary mismatch')

            expect(subscription.endsAt).toEqual(new Date('2031-06-01T00:00:00Z'))
            expect(subscription.nextPayAt).toEqual(new Date('2031-06-01T00:00:00Z'))
            expect(manager.save).not.toHaveBeenCalled()
            expect(instance.reconcileActivation).not.toHaveBeenCalled()
        })

        it.each([undefined, 'not-a-date'])('rejects an already processed charge with a %s stored boundary', async (storedBoundary) => {
            const { instance, localPayment, subscription, manager } = createProcessedFixture(storedBoundary)

            await expect(
                instance.processConfirmedPlategaRecurrentCharge(localPayment.id, new Date('2031-07-01T00:00:00Z')),
            ).rejects.toThrow('Processed recurrent charge paid-through boundary mismatch')

            expect(subscription.endsAt).toEqual(new Date('2031-06-01T00:00:00Z'))
            expect(manager.save).not.toHaveBeenCalled()
            expect(instance.reconcileActivation).not.toHaveBeenCalled()
        })
    })
})
