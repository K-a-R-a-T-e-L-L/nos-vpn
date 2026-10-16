import * as fs from 'fs'
import * as path from 'path'

import { PaymentCreateService } from './payment-create.service'
import { PaymentProviderRoutingService } from './payment-provider-routing.service'
import { PaymentSideEffectsService } from './payment-side-effects.service'
import { PaymentStatusService } from './payment-status.service'
import { PaymentService } from './payment.service'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentProviderPolicyService } from '../providers/payment-provider-policy.service'
import { PLATEGA_PROVIDER } from '../providers/platega-payment.provider'

function createMemoryRepository<T extends { id?: string; createdAt?: Date }>() {
    const rows: T[] = []
    const outboxRows: any[] = []
    let seq = 1

    const repository: any = {
        rows,
        async save(entity: T) {
            if (!entity.id) {
                entity.id = `id-${seq++}`
                entity.createdAt = entity.createdAt || new Date(Date.now() + seq)
                rows.push(entity)
                return entity
            }

            const index = rows.findIndex((row) => row.id === entity.id)
            if (index >= 0) {
                rows[index] = entity
            } else {
                rows.push(entity)
            }
            return entity
        },
        async findOne(options: any) {
            const where = options?.where
            if (!where) {
                return null
            }

            const candidates = Array.isArray(where) ? where : [where]
            const found = rows.filter((row: any) =>
                candidates.some((candidate: any) =>
                    Object.entries(candidate).every(([key, value]) => row[key] === value),
                ),
            )

            if (options?.order?.createdAt === 'DESC') {
                found.sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
            }

            return found[0] || null
        },
    }
    const manager: any = {
        save: (entity: T) => repository.save(entity),
        getRepository: () => ({
            createQueryBuilder: () => ({
                insert() {
                    return this
                },
                into() {
                    return this
                },
                values(value: any) {
                    this.value = value
                    return this
                },
                orIgnore() {
                    return this
                },
                async execute() {
                    if (!outboxRows.some((item) => item.paymentId === this.value.paymentId)) {
                        outboxRows.push(this.value)
                    }
                    return { identifiers: [] }
                },
            }),
        }),
    }
    repository.manager = { transaction: async (work: any) => work(manager) }
    repository.outboxRows = outboxRows
    return repository
}

describe('PaymentService Platega crypto lifecycle', () => {
    function createService() {
        const paymentRepository = createMemoryRepository<any>()
        const webhookEventRepository = createMemoryRepository<any>()
        const planRepository = {
            async findOne() {
                return { id: 'plan-2', amount: 149, name: 'VPN 2', period: 30, code: 'vpn_30_1', devicesLimit: 1, isActive: true }
            },
        }
        const subscription = {
            id: 'sub-1',
            userId: 'user-1',
            user: { id: 'user-1', telegramId: 123456 },
            planId: 'plan-1',
            plan: { id: 'plan-1', amount: 99, name: 'VPN 1', period: 30, code: 'vpn_30_1', devicesLimit: 1, isActive: true },
        }
        const subscriptionService = {
            async getOne() {
                return subscription
            },
        }
        const configValues: Record<string, string> = {
            PAYMENT_RETURN_URL: 'https://t.me/test_bot?start=pay_success_',
            PAYMENT_FAIL_RETURN_URL: 'https://t.me/test_bot?start=pay_fail_',
            PAYMENT_WEB_RETURN_URL: 'https://site.example/payment/success/',
            PAYMENT_WEB_FAIL_RETURN_URL: 'https://site.example/payment/fail/',
            PLATEGA_CRYPTO_ENABLED: 'true',
        }
        const configService = {
            get(key: string) {
                return configValues[key]
            },
        }
        let parsedPayment = {
            provider: PLATEGA_PROVIDER,
            providerEventId: 'provider-payment-1:CONFIRMED',
            providerPaymentId: 'provider-payment-1',
            eventType: 'paymentStatus',
            status: PaymentStatusEnum.SUCCEEDED,
            rawStatus: 'CONFIRMED',
            amount: 99,
            currency: 'RUB',
            metadata: {
                subscription_id: 'sub-1',
                plan_id: 'plan-1',
                local_payment_id: 'id-1',
            },
            paymentUrl: 'https://pay.example/1',
        }
        const plategaProvider = {
            createPayment: jest.fn(async (input: any) => ({
                providerPaymentId: 'provider-payment-1',
                paymentUrl: 'https://pay.example/1',
                raw: {
                    transactionId: 'provider-payment-1',
                    status: 'PENDING',
                    hasUrl: true,
                    input,
                },
            })),
            verifyWebhook: jest.fn(() => true),
            parseWebhook: jest.fn(() => parsedPayment),
            getPaymentStatus: jest.fn(async () => parsedPayment),
        }
        const orchestrator = { activatePaidSubscription: jest.fn(async () => ({})) }
        const referralService = {
            redeemFullPayment: jest.fn(async () => ({ redeemedRub: 99, balanceRub: 0 })),
            refundBonusPayment: jest.fn(async () => ({})),
        }
        const promoService = {
            validatePromoForUser: jest.fn(),
            calculateDiscountAmount: jest.fn((amount: number, valuePercent: number) =>
                Math.floor((amount * valuePercent) / 100),
            ),
            calculateFinalAmount: jest.fn(
                (amount: number, valuePercent: number) => amount - Math.floor((amount * valuePercent) / 100),
            ),
            reserveUsage: jest.fn(async () => ({})),
            cancelUsage: jest.fn(async () => ({})),
        }
        const paymentPromoLifecycle = {
            finalizeSuccessfulPayment: jest.fn(async () => ({ status: 'APPLIED' })),
            cancelFailedPayment: jest.fn(async () => ({ status: 'CANCELED' })),
        }
        const analyticsService = {
            trackPlanSelected: jest.fn(async () => undefined),
        }
        const bot = { telegram: { sendMessage: jest.fn(async () => ({})) } }
        const yookassaProvider = { createPayment: jest.fn() }
        const paymentProviderPolicy = new PaymentProviderPolicyService(configService as any)
        const paymentProviderRouting = new PaymentProviderRoutingService(configService as any, paymentProviderPolicy)
        const paymentSideEffects = new PaymentSideEffectsService(
            paymentRepository as any,
            subscriptionService as any,
            paymentPromoLifecycle as any,
            bot as any,
        )

        const paymentCreate = new PaymentCreateService(
            paymentRepository as any,
            planRepository as any,
            subscriptionService as any,
            orchestrator as any,
            plategaProvider as any,
            referralService as any,
            promoService as any,
            analyticsService as any,
            yookassaProvider as any,
            paymentProviderRouting,
            paymentSideEffects,
            undefined,
            undefined,
            configService as any,
        )
        const paymentStatus = new PaymentStatusService(
            paymentRepository as any,
            webhookEventRepository as any,
            subscriptionService as any,
            orchestrator as any,
            plategaProvider as any,
            yookassaProvider as any,
            paymentProviderRouting,
            undefined,
            paymentSideEffects,
        )
        const service = new PaymentService(paymentRepository as any, paymentCreate, paymentStatus)

        return {
            service,
            paymentRepository,
            webhookEventRepository,
            plategaProvider,
            orchestrator,
            referralService,
            promoService,
            paymentPromoLifecycle,
            configValues,
            setParsedPayment: (value: any) => {
                parsedPayment = value
            },
        }
    }

    it('creates ordinary ONE_TIME through Platega when it is the primary provider', async () => {
        const { service, paymentRepository, plategaProvider } = createService()

        const result = await service.createPayment('sub-1', 'plan-2', undefined, 'web')

        expect(plategaProvider.createPayment).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 149,
                checkoutMode: 'ONE_TIME',
                merchantProfile: 'web',
                metadata: expect.objectContaining({
                    local_payment_id: 'id-1',
                    subscription_id: 'sub-1',
                    plan_id: 'plan-2',
                    payment_profile: 'web',
                }),
            }),
        )
        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                status: PaymentStatusEnum.PENDING,
                provider: PLATEGA_PROVIDER,
                kind: 'EXTERNAL',
                merchant: 'SITE',
                providerPaymentId: 'provider-payment-1',
                metadataSnapshot: expect.objectContaining({ payment_channel: 'PLATEGA_ONE_TIME' }),
            }),
        )
        expect(result.paymentLink).toBe('https://pay.example/1')
    })

    it('creates a crypto local PENDING payment with dynamic bot return urls before returning provider payment url', async () => {
        const { service, paymentRepository, plategaProvider } = createService()

        const result = await service.createCryptoPaymentForUser('user-1', 'plan-1', undefined, 'bot')

        expect(plategaProvider.createPayment).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 99,
                currency: 'RUB',
                returnUrl: 'https://t.me/test_bot?start=pay_success_id-1',
                failedUrl: 'https://t.me/test_bot?start=pay_fail_id-1',
                metadata: expect.objectContaining({
                    subscription_id: 'sub-1',
                    plan_id: 'plan-1',
                    local_payment_id: 'id-1',
                }),
            }),
        )
        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                status: PaymentStatusEnum.PENDING,
                provider: PLATEGA_PROVIDER,
                providerPaymentId: 'provider-payment-1',
                paymentUrl: 'https://pay.example/1',
                returnUrl: 'https://t.me/test_bot?start=pay_success_id-1',
            }),
        )
        expect(result.paymentLink).toBe('https://pay.example/1')
    })

    it('activates subscription immediately for 100 percent promo without provider redirect', async () => {
        const { service, paymentRepository, plategaProvider, orchestrator, promoService, paymentPromoLifecycle } =
            createService()
        promoService.validatePromoForUser.mockResolvedValue({
            id: 'promo-1',
            code: 'FREE100',
            valuePercent: 100,
            durationDays: 34,
            devicesLimit: 1,
        })

        const result = await service.createPayment('sub-1', 'plan-2', 'FREE100')

        expect(plategaProvider.createPayment).not.toHaveBeenCalled()
        expect(paymentPromoLifecycle.finalizeSuccessfulPayment).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ paymentId: 'id-1', promoCodeId: 'promo-1', userId: 'user-1' }),
        )
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledWith(
            expect.objectContaining({
                subscriptionId: 'sub-1',
                planId: 'plan-2',
                paidAmountRub: 0,
                promoTerms: {
                    durationDays: 34,
                    devicesLimit: 1,
                },
            }),
        )
        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                amount: 0,
                status: PaymentStatusEnum.SUCCEEDED,
                provider: 'promo_discount',
            }),
        )
        expect(result).toEqual(
            expect.objectContaining({
                ok: true,
                status: PaymentStatusEnum.SUCCEEDED,
                paidWithPromo: true,
                redirectUrl: '/dashboard',
            }),
        )
    })

    it('creates crypto as a server-owned external SITE payment and reuses the generic callback exactly once', async () => {
        const { service, paymentRepository, plategaProvider, orchestrator } = createService()

        await service.createCryptoPaymentForUser('user-1', 'plan-2')
        expect(plategaProvider.createPayment).toHaveBeenCalledWith(
            expect.objectContaining({ checkoutMode: 'PLATEGA_CRYPTO', merchantProfile: 'web' }),
        )
        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                provider: PLATEGA_PROVIDER,
                kind: 'EXTERNAL',
                merchant: 'SITE',
                metadataSnapshot: expect.objectContaining({ platega_payment_method: 13, payment_channel: 'PLATEGA_CRYPTO' }),
            }),
        )

        await service.handlePlategaWebhook({ id: 'provider-payment-1', status: 'CONFIRMED' }, { 'x-secret': 'ok' })
        await service.handlePlategaWebhook({ id: 'provider-payment-1', status: 'CONFIRMED' }, { 'x-secret': 'ok' })
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledTimes(1)
        expect(paymentRepository.rows[0].status).toBe(PaymentStatusEnum.SUCCEEDED)
    })

    it('rejects crypto before a provider call while the feature flag is off', async () => {
        const { service, configValues, plategaProvider } = createService()
        configValues.PLATEGA_CRYPTO_ENABLED = 'false'
        await expect(service.createCryptoPaymentForUser('user-1', 'plan-2')).rejects.toThrow('Platega crypto payments are disabled')
        expect(plategaProvider.createPayment).not.toHaveBeenCalled()
    })

    it('processes confirmed Platega webhook idempotently', async () => {
        const { service, orchestrator, paymentRepository } = createService()
        await service.createCryptoPaymentForUser('user-1', 'plan-1')

        await service.handlePlategaWebhook({ id: 'provider-payment-1', status: 'CONFIRMED' }, { 'x-secret': 'ok' })
        const duplicate = await service.handlePlategaWebhook(
            { id: 'provider-payment-1', status: 'CONFIRMED' },
            { 'x-secret': 'ok' },
        )

        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledTimes(1)
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentId: 'id-1',
                paidAmountRub: 99,
            }),
        )
        expect(duplicate).toEqual({ ok: true, duplicate: true })
        expect(paymentRepository.outboxRows).toHaveLength(1)
        expect(paymentRepository.outboxRows[0]).toEqual(
            expect.objectContaining({ paymentId: 'id-1', status: 'PENDING' }),
        )
    })

    it('pays with bonus balance only when full amount can be redeemed', async () => {
        const { service, paymentRepository, orchestrator, referralService } = createService()

        const result = await service.createBonusPayment('sub-1')

        expect(referralService.redeemFullPayment).toHaveBeenCalledWith('user-1', 99, { notify: false })
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledWith(
            expect.objectContaining({
                subscriptionId: 'sub-1',
                planId: 'plan-1',
                paymentId: 'id-1',
                paidAmountRub: 0,
                paymentExternalId: expect.stringContaining('bonus:sub-1:plan-1:'),
            }),
        )
        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                amount: 99,
                status: PaymentStatusEnum.SUCCEEDED,
                provider: 'bonus_balance',
            }),
        )
        expect(result).toEqual(
            expect.objectContaining({
                ok: true,
                status: PaymentStatusEnum.SUCCEEDED,
                paidWithBonus: true,
                bonusChargedRub: 99,
            }),
        )
    })

    it('does not activate subscription for canceled webhook', async () => {
        const { service, orchestrator, setParsedPayment } = createService()
        await service.createCryptoPaymentForUser('user-1', 'plan-1')
        setParsedPayment({
            provider: PLATEGA_PROVIDER,
            providerEventId: 'provider-payment-1:CANCELED',
            providerPaymentId: 'provider-payment-1',
            eventType: 'paymentStatus',
            status: PaymentStatusEnum.CANCELED,
            rawStatus: 'CANCELED',
            amount: 99,
            currency: 'RUB',
            metadata: {
                subscription_id: 'sub-1',
                plan_id: 'plan-1',
                local_payment_id: 'id-1',
            },
            paymentUrl: 'https://pay.example/1',
        })

        const result = await service.handlePlategaWebhook(
            { id: 'provider-payment-1', status: 'CANCELED' },
            { 'x-secret': 'ok' },
        )

        expect(result).toEqual({ ok: true, status: PaymentStatusEnum.CANCELED })
        expect(orchestrator.activatePaidSubscription).not.toHaveBeenCalled()
    })

    it('maps chargeback to REFUNDED without VPN deactivation or activation', async () => {
        const { service, orchestrator, setParsedPayment } = createService()
        await service.createCryptoPaymentForUser('user-1', 'plan-1')
        setParsedPayment({
            provider: PLATEGA_PROVIDER,
            providerEventId: 'provider-payment-1:CHARGEBACKED',
            providerPaymentId: 'provider-payment-1',
            eventType: 'paymentStatus',
            status: PaymentStatusEnum.REFUNDED,
            rawStatus: 'CHARGEBACKED',
            metadata: { local_payment_id: 'id-1', subscription_id: 'sub-1', plan_id: 'plan-1' },
        })

        const result = await service.handlePlategaWebhook(
            { id: 'provider-payment-1', status: 'CHARGEBACKED' },
            { 'x-secret': 'ok' },
        )

        expect(result).toEqual({ ok: true, status: PaymentStatusEnum.REFUNDED })
        expect(orchestrator.activatePaidSubscription).not.toHaveBeenCalled()
    })

    it('stores invalid webhook attempt with signatureValid false and does not activate', async () => {
        const { service, webhookEventRepository, plategaProvider, orchestrator } = createService()
        plategaProvider.verifyWebhook.mockImplementationOnce(() => {
            throw new Error('invalid secret')
        })

        await expect(
            service.handlePlategaWebhook({ id: 'provider-payment-1', status: 'CONFIRMED' }, {}),
        ).rejects.toThrow('invalid secret')

        expect(webhookEventRepository.rows[0]).toEqual(
            expect.objectContaining({
                signatureValid: false,
                processed: false,
                processingError: 'invalid secret',
            }),
        )
        expect(orchestrator.activatePaidSubscription).not.toHaveBeenCalled()
    })

    it('checks a specific payment for the owner and can recover success from fail return url', async () => {
        const { service, orchestrator, setParsedPayment } = createService()
        await service.createCryptoPaymentForUser('user-1', 'plan-1')
        setParsedPayment({
            provider: PLATEGA_PROVIDER,
            providerEventId: 'provider-payment-1:CONFIRMED',
            providerPaymentId: 'provider-payment-1',
            eventType: 'statusCheck',
            status: PaymentStatusEnum.SUCCEEDED,
            rawStatus: 'CONFIRMED',
            metadata: { local_payment_id: 'id-1', subscription_id: 'sub-1', plan_id: 'plan-1' },
        })

        const result = await service.checkPaymentForUser('id-1', 'user-1')

        expect(result.status).toBe(PaymentStatusEnum.SUCCEEDED)
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledTimes(1)
    })

    it('does not check or activate foreign payment', async () => {
        const { service, orchestrator, plategaProvider } = createService()
        await service.createCryptoPaymentForUser('user-1', 'plan-1')

        const result = await service.checkPaymentForUser('id-1', 'other-user')

        expect(result).toEqual({ ok: true, status: null, message: 'payment_not_found' })
        expect(plategaProvider.getPaymentStatus).not.toHaveBeenCalled()
        expect(orchestrator.activatePaidSubscription).not.toHaveBeenCalled()
    })

    it('keeps unknown provider status pending and does not activate', async () => {
        const { service, orchestrator, setParsedPayment } = createService()
        await service.createCryptoPaymentForUser('user-1', 'plan-1')
        setParsedPayment({
            provider: PLATEGA_PROVIDER,
            providerEventId: 'provider-payment-1:UNKNOWN_NEW_STATUS',
            providerPaymentId: 'provider-payment-1',
            eventType: 'statusCheck',
            status: PaymentStatusEnum.PENDING,
            rawStatus: 'UNKNOWN_NEW_STATUS',
            metadata: { local_payment_id: 'id-1', subscription_id: 'sub-1', plan_id: 'plan-1' },
        })

        const result = await service.checkPaymentForUser('id-1', 'user-1')

        expect(result.status).toBe(PaymentStatusEnum.PENDING)
        expect(orchestrator.activatePaidSubscription).not.toHaveBeenCalled()
    })

    it('does not roll back succeeded payment when later status is pending or unknown', async () => {
        const { service, paymentRepository, orchestrator, setParsedPayment } = createService()
        await service.createCryptoPaymentForUser('user-1', 'plan-1')
        await service.handlePlategaWebhook({ id: 'provider-payment-1', status: 'CONFIRMED' }, { 'x-secret': 'ok' })
        setParsedPayment({
            provider: PLATEGA_PROVIDER,
            providerEventId: 'provider-payment-1:UNKNOWN_NEW_STATUS',
            providerPaymentId: 'provider-payment-1',
            eventType: 'statusCheck',
            status: PaymentStatusEnum.PENDING,
            rawStatus: 'UNKNOWN_NEW_STATUS',
            metadata: { local_payment_id: 'id-1', subscription_id: 'sub-1', plan_id: 'plan-1' },
        })

        const result = await service.checkPaymentForUser('id-1', 'user-1')

        expect(result.status).toBe(PaymentStatusEnum.SUCCEEDED)
        expect(paymentRepository.rows[0].status).toBe(PaymentStatusEnum.SUCCEEDED)
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledTimes(1)
    })

    it('documents safe provider defaults and empty YooKassa credentials', () => {
        const envExample = fs.readFileSync(path.resolve(__dirname, '../../../.env.example'), 'utf8')

        expect(envExample).toContain('PAYMENT_PRIMARY_PROVIDER=PLATEGA')
        expect(envExample).toContain('PAYMENT_YOOKASSA_ENABLED=false')
        expect(envExample).toContain('YOOKASSA_API_BASE_URL=https://api.yookassa.ru/v3')
        expect(envExample).toMatch(/^YOOKASSA_SITE_SHOP_ID=$/m)
        expect(envExample).toMatch(/^YOOKASSA_SITE_SECRET_KEY=$/m)
        expect(envExample).toMatch(/^YOOKASSA_BOT_SHOP_ID=$/m)
        expect(envExample).toMatch(/^YOOKASSA_BOT_SECRET_KEY=$/m)
        expect(envExample).not.toMatch(/^YOOKASSA_(?:SITE|BOT)_(?:SHOP_ID|SECRET_KEY)=.+$/m)
        expect(envExample).not.toContain('PLATEGA_PAYMENT_METHOD')
        expect(envExample).toContain('PAYMENT_RETURN_URL=https://t.me/your_bot_username?start=pay_success_')
    })
})
