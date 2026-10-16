import { PaymentCreateService } from './payment-create.service'
import { PaymentProviderRoutingService } from './payment-provider-routing.service'
import { PaymentSideEffectsService } from './payment-side-effects.service'
import { PaymentService } from './payment.service'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentKind } from '../enum/payment-kind.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentProviderError } from '../errors/payment-provider.error'
import { PaymentMethodConsentSource } from '../types/payment-method-consent-source'

function memoryRepository() {
    const rows: any[] = []
    const saves: any[] = []
    let sequence = 1
    const repository: any = {
        rows,
        saves,
        async save(entity: any) {
            if (!entity.id) {
                entity.id = `payment-${sequence++}`
                rows.push(entity)
            }
            saves.push({ ...entity, metadataSnapshot: { ...(entity.metadataSnapshot || {}) } })
            return entity
        },
        async findOne() {
            return null
        },
    }
    repository.manager = { transaction: async (work: any) => work({}) }
    return repository
}

describe('PaymentService YooKassa create path', () => {
    function createService(
        options: {
            primary?: PaymentProvider
            promo?: any
            yookassaError?: PaymentProviderError
            policyError?: PaymentProviderError
        } = {},
    ) {
        const paymentRepository = memoryRepository()
        const subscription = {
            id: 'sub-1',
            userId: 'user-1',
            user: { id: 'user-1', telegramId: 123 },
            planId: 'plan-1',
            plan: { id: 'plan-1', amount: 399, name: 'VPN 1', period: 30 },
        }
        const configValues: Record<string, string> = {
            PAYMENT_RETURN_URL: 'https://t.me/test_bot?start=pay_success_',
            PAYMENT_FAIL_RETURN_URL: 'https://t.me/test_bot?start=pay_fail_',
            PAYMENT_WEB_RETURN_URL: 'https://site.example/payment/success/',
            PAYMENT_WEB_FAIL_RETURN_URL: 'https://site.example/payment/fail/',
        }
        const plategaProvider = {
            createPayment: jest.fn(async () => ({
                providerPaymentId: 'platega-1',
                providerInvoiceId: null,
                paymentUrl: 'https://platega.example/pay',
                raw: { transactionId: 'platega-1', status: 'PENDING', hasUrl: true },
            })),
        }
        const yookassaProvider = {
            createPayment: jest.fn(async (input: any) => {
                if (options.yookassaError) {
                    throw options.yookassaError
                }
                expect(paymentRepository.saves.length).toBeGreaterThanOrEqual(2)
                return {
                    provider: PaymentProvider.YOOKASSA,
                    merchant: input.merchant,
                    providerPaymentId: 'yk-1',
                    status: PaymentStatusEnum.PENDING,
                    externalStatus: 'pending',
                    confirmationUrl: 'https://yookassa.example/confirm',
                    providerInvoiceId: null,
                    paymentMethod: { id: 'must-not-persist', saved: true, type: 'bank_card' },
                    safeResponseSnapshot: { id: 'yk-1', status: 'pending', payment_method_saved: true },
                }
            }),
        }
        const policy = {
            getPrimaryProvider: jest.fn(() => options.primary || PaymentProvider.PLATEGA),
            resolveCheckoutProvider: jest.fn((mode: string) =>
                mode === 'PLATEGA_CRYPTO' ? PaymentProvider.PLATEGA : PaymentProvider.YOOKASSA,
            ),
            assertProviderAvailable: jest.fn(() => {
                if (options.policyError) throw options.policyError
            }),
        }
        const promoService = {
            validatePromoForUser: jest.fn(async () => options.promo || null),
            calculateDiscountAmount: jest.fn((amount: number, percent: number) => (amount * percent) / 100),
            calculateFinalAmount: jest.fn((amount: number, percent: number) => amount - (amount * percent) / 100),
            reserveUsage: jest.fn(async () => undefined),
            cancelUsage: jest.fn(async () => undefined),
        }
        const paymentPromoLifecycle = {
            finalizeSuccessfulPayment: jest.fn(async () => ({ status: 'APPLIED' })),
            cancelFailedPayment: jest.fn(async () => ({ status: 'CANCELED' })),
        }
        const orchestrator = { activatePaidSubscription: jest.fn(async () => undefined) }
        const configService = { get: jest.fn((key: string) => configValues[key]) }
        const paymentProviderRouting = new PaymentProviderRoutingService(configService as any, policy as any)
        const paymentSideEffects = new PaymentSideEffectsService(
            paymentRepository as any,
            { getOne: jest.fn(async () => subscription) } as any,
            paymentPromoLifecycle as any,
            { telegram: { sendMessage: jest.fn() } } as any,
        )
        const paymentCreate = new PaymentCreateService(
            paymentRepository as any,
            { findOne: jest.fn() } as any,
            { getOne: jest.fn(async () => subscription) } as any,
            orchestrator as any,
            plategaProvider as any,
            { redeemFullPayment: jest.fn(), refundBonusPayment: jest.fn() } as any,
            promoService as any,
            { trackPlanSelected: jest.fn(async () => undefined) } as any,
            yookassaProvider as any,
            paymentProviderRouting,
            paymentSideEffects,
            undefined,
            undefined,
        )
        const service = new PaymentService(paymentRepository as any, paymentCreate, {} as any)

        return {
            service,
            paymentRepository,
            plategaProvider,
            yookassaProvider,
            policy,
            promoService,
            paymentPromoLifecycle,
            orchestrator,
        }
    }

    it('routes ONE_TIME through the configured primary provider and defaults to Platega', async () => {
        const { service, plategaProvider, yookassaProvider, policy, paymentRepository } = createService()

        const result = await service.createPayment('sub-1')

        expect(policy.getPrimaryProvider).toHaveBeenCalledWith('user-1')
        expect(policy.assertProviderAvailable).toHaveBeenCalledWith(PaymentProvider.PLATEGA)
        expect(yookassaProvider.createPayment).not.toHaveBeenCalled()
        expect(plategaProvider.createPayment).toHaveBeenCalledWith(
            expect.objectContaining({ checkoutMode: PaymentCheckoutMode.ONE_TIME, merchantProfile: 'bot' }),
        )
        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                provider: 'platega',
                kind: PaymentKind.EXTERNAL,
                merchant: PaymentMerchant.BOT,
                metadataSnapshot: expect.objectContaining({ payment_channel: 'PLATEGA_ONE_TIME' }),
            }),
        )
        expect(result.paymentUrl).toBe('https://platega.example/pay')
    })

    it.each([
        ['web', PaymentMerchant.SITE, 'https://site.example/payment/success/payment-1'],
        ['bot', PaymentMerchant.BOT, 'https://t.me/test_bot?start=pay_success_payment-1'],
    ] as const)('routes %s payments to the isolated YooKassa merchant', async (profile, merchant, returnUrl) => {
        const { service, paymentRepository, plategaProvider, yookassaProvider, orchestrator } = createService({
            primary: PaymentProvider.YOOKASSA,
        })

        const result = await service.createPayment('sub-1', undefined, undefined, profile)

        expect(plategaProvider.createPayment).not.toHaveBeenCalled()
        expect(yookassaProvider.createPayment).toHaveBeenCalledWith(
            expect.objectContaining({
                localPaymentId: 'payment-1',
                idempotencyKey: expect.stringMatching(
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
                ),
                merchant,
                amountRub: 399,
                returnUrl,
                paymentMethodConsentSource: PaymentMethodConsentSource.NONE,
            }),
        )
        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                provider: 'yookassa',
                kind: PaymentKind.EXTERNAL,
                merchant,
                providerPaymentId: 'yk-1',
                paymentUrl: 'https://yookassa.example/confirm',
                externalStatus: 'pending',
                status: PaymentStatusEnum.PENDING,
                metadataSnapshot: expect.objectContaining({
                    payment_method_consent_source: PaymentMethodConsentSource.NONE,
                }),
            }),
        )
        expect(JSON.stringify(paymentRepository.rows[0])).not.toContain('must-not-persist')
        expect(orchestrator.activatePaidSubscription).not.toHaveBeenCalled()
        expect(result.paymentUrl).toBe('https://yookassa.example/confirm')
    })

    it('persists one UUID-v4 key before submission and gives a new operation a different key', async () => {
        const { service, paymentRepository, yookassaProvider } = createService({
            primary: PaymentProvider.YOOKASSA,
        })

        await service.createPayment('sub-1', undefined, undefined, 'web')
        await service.createPayment('sub-1', undefined, undefined, 'web')

        const [firstKey, secondKey] = yookassaProvider.createPayment.mock.calls.map(
            ([providerInput]: [Record<string, unknown>]) => providerInput.idempotencyKey,
        )
        expect(firstKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
        expect(firstKey).toHaveLength(36)
        expect(secondKey).toHaveLength(36)
        expect(secondKey).not.toBe(firstKey)
        expect(paymentRepository.saves.some((saved) => saved.idempotencyKey === firstKey)).toBe(true)
        expect(paymentRepository.saves.some((saved) => saved.idempotencyKey === secondKey)).toBe(true)
        expect(String(firstKey)).not.toContain('sub-1')
        expect(String(firstKey)).not.toContain('plan-1')
    })

    it('records disabled YooKassa as a terminal YooKassa configuration failure without fallback', async () => {
        const policyError = new PaymentProviderError({
            message: 'YooKassa payment provider is disabled',
            provider: PaymentProvider.YOOKASSA,
            kind: 'CONFIGURATION',
        })
        const { service, paymentRepository, plategaProvider, yookassaProvider } = createService({
            primary: PaymentProvider.YOOKASSA,
            policyError,
        })

        await expect(service.createPayment('sub-1')).rejects.toThrow('YooKassa payment provider is disabled')

        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                provider: 'yookassa',
                kind: PaymentKind.EXTERNAL,
                merchant: PaymentMerchant.BOT,
                status: PaymentStatusEnum.FAILED,
                externalStatus: 'configuration_error',
            }),
        )
        expect(plategaProvider.createPayment).not.toHaveBeenCalled()
        expect(yookassaProvider.createPayment).not.toHaveBeenCalled()
    })

    it.each([
        ['CONFIGURATION', 'configuration_error'],
        ['TERMINAL_REQUEST', 'terminal_request_error'],
    ] as const)('marks %s as failed and releases promo reservation', async (kind, externalStatus) => {
        const error = new PaymentProviderError({
            message: 'safe provider failure',
            provider: PaymentProvider.YOOKASSA,
            merchant: PaymentMerchant.BOT,
            kind,
            statusCode: kind === 'TERMINAL_REQUEST' ? 400 : undefined,
            providerCode: kind === 'TERMINAL_REQUEST' ? 'bad_request' : undefined,
        })
        const { service, paymentRepository, paymentPromoLifecycle, plategaProvider } = createService({
            primary: PaymentProvider.YOOKASSA,
            promo: { id: 'promo-1', code: 'SAVE10', valuePercent: 10 },
            yookassaError: error,
        })

        await expect(service.createPayment('sub-1', undefined, 'SAVE10')).rejects.toThrow('safe provider failure')

        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                status: PaymentStatusEnum.FAILED,
                externalStatus,
                failedAt: expect.any(Date),
            }),
        )
        expect(paymentPromoLifecycle.cancelFailedPayment).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ paymentId: 'payment-1', promoCodeId: 'promo-1', userId: 'user-1' }),
        )
        expect(plategaProvider.createPayment).not.toHaveBeenCalled()
    })

    it('persists sanitized structured YooKassa failure metadata without raw provider data', async () => {
        const error = new PaymentProviderError({
            message: 'YooKassa rejected the payment creation request',
            provider: PaymentProvider.YOOKASSA,
            merchant: PaymentMerchant.SITE,
            kind: 'TERMINAL_REQUEST',
            statusCode: 400,
            providerCode: 'invalid_request',
            providerType: 'error',
            providerDescription: 'Idempotence key is invalid',
            providerParameter: 'Idempotence-Key',
            providerRequestIdMasked: '***cdef',
        })
        const { service, paymentRepository, orchestrator } = createService({
            primary: PaymentProvider.YOOKASSA,
            yookassaError: error,
        })

        await expect(service.createPayment('sub-1', undefined, undefined, 'web')).rejects.toThrow(
            'YooKassa rejected the payment creation request',
        )

        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                status: PaymentStatusEnum.FAILED,
                externalStatus: 'terminal_request_error',
                metadataSnapshot: expect.objectContaining({
                    providerCreateError: {
                        kind: 'TERMINAL_REQUEST',
                        statusCode: 400,
                        providerCode: 'invalid_request',
                        providerType: 'error',
                        providerDescription: 'Idempotence key is invalid',
                        providerParameter: 'Idempotence-Key',
                        providerRequestIdMasked: '***cdef',
                    },
                }),
            }),
        )
        expect(paymentRepository.rows[0].providerPaymentId).toBeUndefined()
        expect(JSON.stringify(paymentRepository.rows[0])).not.toContain('rawBody')
        expect(orchestrator.activatePaidSubscription).not.toHaveBeenCalled()
    })

    it('keeps an outcome-unknown payment pending and preserves promo reservation', async () => {
        const error = new PaymentProviderError({
            message: 'safe uncertain failure',
            provider: PaymentProvider.YOOKASSA,
            merchant: PaymentMerchant.BOT,
            kind: 'OUTCOME_UNKNOWN',
        })
        const { service, paymentRepository, paymentPromoLifecycle, plategaProvider } = createService({
            primary: PaymentProvider.YOOKASSA,
            promo: { id: 'promo-1', code: 'SAVE10', valuePercent: 10 },
            yookassaError: error,
        })

        await expect(service.createPayment('sub-1', undefined, 'SAVE10')).rejects.toThrow(
            'Payment creation status is being clarified',
        )

        expect(paymentRepository.rows[0]).toEqual(
            expect.objectContaining({
                status: PaymentStatusEnum.PENDING,
                externalStatus: 'creation_outcome_unknown',
            }),
        )
        expect(paymentRepository.rows[0].failedAt).toBeUndefined()
        expect(paymentPromoLifecycle.cancelFailedPayment).not.toHaveBeenCalled()
        expect(plategaProvider.createPayment).not.toHaveBeenCalled()
    })

    it('keeps the full-discount path provider-free', async () => {
        const { service, plategaProvider, yookassaProvider, orchestrator } = createService({
            primary: PaymentProvider.YOOKASSA,
            promo: { id: 'promo-1', code: 'FREE100', valuePercent: 100 },
        })

        const result = await service.createPayment('sub-1', undefined, 'FREE100')

        expect(plategaProvider.createPayment).not.toHaveBeenCalled()
        expect(yookassaProvider.createPayment).not.toHaveBeenCalled()
        expect(orchestrator.activatePaidSubscription).toHaveBeenCalledTimes(1)
        expect(result).toEqual(expect.objectContaining({ paidWithPromo: true }))
    })
})
