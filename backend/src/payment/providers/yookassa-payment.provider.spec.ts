import { YooKassaPaymentProvider } from './yookassa-payment.provider'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentProviderError } from '../errors/payment-provider.error'
import { PaymentMethodConsentSource } from '../types/payment-method-consent-source'

describe('YooKassaPaymentProvider', () => {
    const idempotencyKey = '123e4567-e89b-42d3-a456-426614174000'
    const values: Record<string, string | undefined> = {
        YOOKASSA_API_BASE_URL: 'https://api.yookassa.ru/v3/',
        YOOKASSA_HTTP_TIMEOUT_MS: '15000',
        YOOKASSA_SITE_SHOP_ID: 'site-shop',
        YOOKASSA_SITE_SECRET_KEY: 'site-secret',
        YOOKASSA_BOT_SHOP_ID: 'bot-shop',
        YOOKASSA_BOT_SECRET_KEY: 'bot-secret',
        PAYMENT_RECURRENT_ENABLED: 'false',
    }

    const input = {
        localPaymentId: 'local-1',
        idempotencyKey,
        merchant: PaymentMerchant.SITE,
        amountRub: 399,
        description: 'Оплата VPN',
        returnUrl: 'https://site.example/payment/success/local-1',
        subscriptionId: 'sub-1',
        planId: 'plan-1',
        paymentMethodConsentSource: PaymentMethodConsentSource.YOOKASSA_CONDITIONAL,
    }

    function createProvider(overrides: Record<string, string | undefined> = {}) {
        const config = { ...values, ...overrides }
        return new YooKassaPaymentProvider({
            get: jest.fn((key: string) => config[key]),
        } as any)
    }

    it.each([
        [PaymentMerchant.SITE, {}, true],
        [PaymentMerchant.SITE, { YOOKASSA_SITE_SHOP_ID: '' }, false],
        [PaymentMerchant.SITE, { YOOKASSA_SITE_SECRET_KEY: ' ' }, false],
        [PaymentMerchant.BOT, {}, true],
        [PaymentMerchant.BOT, { YOOKASSA_BOT_SHOP_ID: '' }, false],
        [PaymentMerchant.BOT, { YOOKASSA_BOT_SECRET_KEY: ' ' }, false],
    ])('reports %s merchant readiness without making a provider request', (merchant, overrides, expected) => {
        expect(createProvider(overrides).isMerchantConfigured(merchant)).toBe(expected)
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('keeps SITE and BOT merchant readiness independent', () => {
        const siteOnly = createProvider({ YOOKASSA_BOT_SHOP_ID: '', YOOKASSA_BOT_SECRET_KEY: '' })
        const botOnly = createProvider({ YOOKASSA_SITE_SHOP_ID: '', YOOKASSA_SITE_SECRET_KEY: '' })

        expect(siteOnly.isMerchantConfigured(PaymentMerchant.SITE)).toBe(true)
        expect(siteOnly.isMerchantConfigured(PaymentMerchant.BOT)).toBe(false)
        expect(botOnly.isMerchantConfigured(PaymentMerchant.SITE)).toBe(false)
        expect(botOnly.isMerchantConfigured(PaymentMerchant.BOT)).toBe(true)
        expect(global.fetch).not.toHaveBeenCalled()
    })

    function response(
        body: unknown,
        status = 200,
        headers: Record<string, string> = { 'content-type': 'application/json' },
    ) {
        const normalizedHeaders = Object.fromEntries(
            Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
        )
        return {
            ok: status >= 200 && status < 300,
            status,
            headers: {
                get: jest.fn((name: string) => normalizedHeaders[name.toLowerCase()] ?? null),
            },
            text: jest.fn(async () => (typeof body === 'string' ? body : JSON.stringify(body))),
        } as any
    }

    function successBody(status = 'pending') {
        return {
            id: 'yk-1',
            status,
            paid: status === 'succeeded',
            amount: { value: '399.00', currency: 'RUB' },
            confirmation: { type: 'redirect', confirmation_url: 'https://yookassa.example/confirm/1' },
            payment_method: { id: 'method-secret-id', saved: true, type: 'bank_card' },
            created_at: '2026-07-28T00:00:00Z',
            test: true,
        }
    }

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.spyOn(global, 'fetch').mockResolvedValue(response(successBody()))
    })

    it.each([
        [PaymentMerchant.SITE, 'site-shop', 'site-secret'],
        [PaymentMerchant.BOT, 'bot-shop', 'bot-secret'],
    ])('selects isolated %s credentials and sends the exact request contract', async (merchant, shopId, secretKey) => {
        const provider = createProvider()

        await provider.createPayment({ ...input, merchant })

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.yookassa.ru/v3/payments',
            expect.objectContaining({ method: 'POST' }),
        )
        const init = (global.fetch as jest.Mock).mock.calls[0][1]
        const encodedAuth = String(init.headers.Authorization).replace('Basic ', '')
        const decodedAuth = Buffer.from(encodedAuth, 'base64').toString('utf8')
        expect(decodedAuth === `${shopId}:${secretKey}`).toBe(true)
        expect(init.headers).toEqual(
            expect.objectContaining({
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Idempotence-Key': idempotencyKey,
            }),
        )
        const body = JSON.parse(init.body)
        expect(body).toEqual({
            amount: { value: '399.00', currency: 'RUB' },
            capture: true,
            confirmation: { type: 'redirect', return_url: input.returnUrl },
            description: 'Оплата VPN',
            metadata: {
                local_payment_id: 'local-1',
                subscription_id: 'sub-1',
                plan_id: 'plan-1',
                merchant,
            },
        })
        expect(body).not.toHaveProperty('save_payment_method')
    })

    it.each([
        [PaymentMethodConsentSource.NONE, false],
        [PaymentMethodConsentSource.YOOKASSA_CONDITIONAL, false],
        [PaymentMethodConsentSource.MERCHANT_EXPLICIT, true],
    ])('sets save_payment_method only for consent source %s', async (paymentMethodConsentSource, expected) => {
        await createProvider().createPayment({ ...input, paymentMethodConsentSource })

        const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
        if (expected) {
            expect(body.save_payment_method).toBe(true)
        } else {
            expect(body).not.toHaveProperty('save_payment_method')
        }
    })

    it.each([
        ['empty', ''],
        ['longer than 64 characters', 'a'.repeat(65)],
        ['not a UUID', 'not-a-uuid'],
        ['not UUID v4', '123e4567-e89b-12d3-a456-426614174000'],
        ['surrounded by whitespace', ` ${idempotencyKey} `],
    ])('rejects an idempotency key that is %s before fetch', async (_label, invalidKey) => {
        let thrown: unknown
        try {
            await createProvider().createPayment({ ...input, idempotencyKey: invalidKey })
        } catch (error) {
            thrown = error
        }

        expect(thrown).toEqual(
            expect.objectContaining({
                kind: 'CONFIGURATION',
                providerCode: 'INVALID_PROVIDER_IDEMPOTENCE_KEY',
            }),
        )
        if (invalidKey) {
            expect(String((thrown as Error).message)).not.toContain(invalidKey)
        }
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('reuses the caller-provided key unchanged for repeated submission', async () => {
        const provider = createProvider()

        await provider.createPayment(input)
        await provider.createPayment(input)

        expect(global.fetch).toHaveBeenCalledTimes(2)
        expect((global.fetch as jest.Mock).mock.calls[0][1].headers['Idempotence-Key']).toBe(idempotencyKey)
        expect((global.fetch as jest.Mock).mock.calls[1][1].headers['Idempotence-Key']).toBe(idempotencyKey)
    })

    it.each([
        [PaymentMerchant.SITE, { YOOKASSA_SITE_SHOP_ID: '' }],
        [PaymentMerchant.BOT, { YOOKASSA_BOT_SECRET_KEY: ' ' }],
    ])('rejects missing %s credentials before fetch', async (merchant, overrides) => {
        const provider = createProvider(overrides)

        await expect(provider.createPayment({ ...input, merchant })).rejects.toEqual(
            expect.objectContaining({ kind: 'CONFIGURATION', merchant }),
        )
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it.each([
        [399, '399.00'],
        [399.5, '399.50'],
    ])('formats RUB amount %s as %s', async (amountRub, expected) => {
        await createProvider().createPayment({ ...input, amountRub })

        const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
        expect(body.amount.value).toBe(expected)
    })

    it.each([0, -1, Number.NaN, 1.001])('rejects invalid amount %s before fetch', async (amountRub) => {
        await expect(createProvider().createPayment({ ...input, amountRub })).rejects.toEqual(
            expect.objectContaining({ kind: 'CONFIGURATION' }),
        )
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it.each([
        ['pending', PaymentStatusEnum.PENDING],
        ['waiting_for_capture', PaymentStatusEnum.PENDING],
        ['succeeded', PaymentStatusEnum.SUCCEEDED],
        ['canceled', PaymentStatusEnum.CANCELED],
        ['new_status', PaymentStatusEnum.PENDING],
    ])('maps YooKassa status %s to %s', async (status, localStatus) => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(response(successBody(status)))

        const result = await createProvider().createPayment(input)

        expect(result).toEqual(
            expect.objectContaining({
                providerPaymentId: 'yk-1',
                status: localStatus,
                externalStatus: status,
                confirmationUrl: 'https://yookassa.example/confirm/1',
                paymentMethod: { id: 'method-secret-id', saved: true, type: 'bank_card' },
            }),
        )
        expect(result.safeResponseSnapshot).toEqual({
            id: 'yk-1',
            status,
            paid: status === 'succeeded',
            amount: { value: '399.00', currency: 'RUB' },
            confirmation: { type: 'redirect', hasUrl: true },
            paymentMethod: { saved: true, type: 'bank_card', hasId: true },
            createdAt: '2026-07-28T00:00:00Z',
            capturedAt: null,
            expiresAt: null,
            test: true,
        })
        expect(JSON.stringify(result.safeResponseSnapshot)).not.toContain('method-secret-id')
        expect(JSON.stringify(result.safeResponseSnapshot)).not.toContain('https://yookassa.example/confirm/1')
    })

    it('retains the safe successful income_amount needed for referral accounting', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(
            response({
                ...successBody('succeeded'),
                income_amount: { value: '382.75', currency: 'RUB' },
            }),
        )

        const result = await createProvider().createPayment(input)

        expect(result.incomeAmountValue).toBe('382.75')
        expect(result.incomeAmountCurrency).toBe('RUB')
        expect(result.safeResponseSnapshot).toMatchObject({
            incomeAmount: { value: '382.75', currency: 'RUB' },
        })
        expect(JSON.stringify(result.safeResponseSnapshot)).not.toMatch(/secret|authorization/i)
    })

    it.each([
        [400, 'TERMINAL_REQUEST'],
        [401, 'TERMINAL_REQUEST'],
        [403, 'TERMINAL_REQUEST'],
        [500, 'OUTCOME_UNKNOWN'],
    ])('classifies HTTP %s as %s without leaking response data', async (status, kind) => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(
            response(
                { type: 'error', code: 'safe_code', description: 'provider detail', secret: 'do-not-leak' },
                status,
            ),
        )

        let thrown: unknown
        try {
            await createProvider().createPayment(input)
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(PaymentProviderError)
        expect(thrown).toEqual(expect.objectContaining({ kind, statusCode: status, providerCode: 'safe_code' }))
        expect(String((thrown as Error).message)).not.toContain('do-not-leak')
        expect(String((thrown as Error).message)).not.toContain('site-secret')
    })

    it('retains only sanitized YooKassa error fields and a masked request id', async () => {
        const rawDescription = `${'D'.repeat(300)}\r\nAuthorization: Basic secret`
        const rawParameter = `${'P'.repeat(80)}\u0000`
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(
            response(
                {
                    type: 'error',
                    code: 'invalid_request',
                    description: rawDescription,
                    parameter: rawParameter,
                    authorization: 'must-not-survive',
                    payment_method: { card: 'must-not-survive' },
                },
                400,
                {
                    'content-type': 'application/json; charset=utf-8',
                    'x-request-id': 'request-secret-abcdef',
                },
            ),
        )

        let thrown: unknown
        try {
            await createProvider().createPayment(input)
        } catch (error) {
            thrown = error
        }

        expect(thrown).toEqual(
            expect.objectContaining({
                kind: 'TERMINAL_REQUEST',
                statusCode: 400,
                providerCode: 'invalid_request',
                providerType: 'error',
                providerDescription: 'D'.repeat(256),
                providerParameter: 'P'.repeat(64),
                providerRequestIdMasked: '***cdef',
            }),
        )
        const serialized = JSON.stringify(thrown)
        expect(serialized).not.toContain('Authorization')
        expect(serialized).not.toContain('must-not-survive')
        expect(serialized).not.toContain('request-secret-abcdef')
        expect(serialized).not.toContain(rawDescription)
    })

    it('handles non-JSON provider errors without retaining the raw body', async () => {
        const rawBody = 'upstream failure Authorization: Basic secret'
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(response(rawBody, 502, { 'content-type': 'text/plain' }))

        let thrown: unknown
        try {
            await createProvider().createPayment(input)
        } catch (error) {
            thrown = error
        }

        expect(thrown).toEqual(
            expect.objectContaining({
                kind: 'OUTCOME_UNKNOWN',
                statusCode: 502,
            }),
        )
        expect(JSON.stringify(thrown)).not.toContain(rawBody)
        expect(JSON.stringify(thrown)).not.toContain('Authorization')
    })

    it('redacts echoed credentials and customer identifiers from retained provider fields', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(
            response(
                {
                    type: 'error',
                    code: 'invalid_request',
                    description:
                        'Authorization: Basic encoded-token site-secret customer@example.com 123e4567-e89b-42d3-a456-426614174000',
                    parameter: 'receipt.customer.email',
                },
                400,
            ),
        )

        let thrown: unknown
        try {
            await createProvider().createPayment(input)
        } catch (error) {
            thrown = error
        }

        const serialized = JSON.stringify(thrown)
        expect(serialized).not.toContain('encoded-token')
        expect(serialized).not.toContain('site-secret')
        expect(serialized).not.toContain('customer@example.com')
        expect(serialized).not.toContain('123e4567-e89b-42d3-a456-426614174000')
    })

    it.each([
        ['network failure', new Error('socket closed')],
        ['abort', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ])('classifies %s as outcome unknown', async (_label, failure) => {
        ;(global.fetch as jest.Mock).mockRejectedValueOnce(failure)

        await expect(createProvider().createPayment(input)).rejects.toEqual(
            expect.objectContaining({ kind: 'OUTCOME_UNKNOWN' }),
        )
    })

    it('classifies response body read failure as outcome unknown', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: jest.fn(async () => {
                throw new Error('body stream interrupted')
            }),
        })

        await expect(createProvider().createPayment(input)).rejects.toEqual(
            expect.objectContaining({ kind: 'OUTCOME_UNKNOWN' }),
        )
    })

    it('classifies an invalid base URL as configuration before fetch', async () => {
        await expect(createProvider({ YOOKASSA_API_BASE_URL: 'not-a-url' }).createPayment(input)).rejects.toEqual(
            expect.objectContaining({ kind: 'CONFIGURATION' }),
        )
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('classifies timeout abort as outcome unknown', async () => {
        jest.useFakeTimers()
        ;(global.fetch as jest.Mock).mockImplementationOnce(
            (_url: string, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () =>
                        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
                    )
                }),
        )

        const promise = createProvider({ YOOKASSA_HTTP_TIMEOUT_MS: '1000' }).createPayment(input)
        const rejection = expect(promise).rejects.toEqual(expect.objectContaining({ kind: 'OUTCOME_UNKNOWN' }))
        await jest.advanceTimersByTimeAsync(1000)

        await rejection
        jest.useRealTimers()
    })

    it('keeps the timeout active while the response body is stalled', async () => {
        jest.useFakeTimers()
        ;(global.fetch as jest.Mock).mockImplementationOnce(async (_url: string, init: RequestInit) => ({
            ok: true,
            status: 200,
            text: () =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () =>
                        reject(Object.assign(new Error('body aborted'), { name: 'AbortError' })),
                    )
                }),
        }))

        const promise = createProvider({ YOOKASSA_HTTP_TIMEOUT_MS: '1000' }).createPayment(input)
        const rejection = expect(promise).rejects.toEqual(expect.objectContaining({ kind: 'OUTCOME_UNKNOWN' }))
        await jest.advanceTimersByTimeAsync(1000)

        await rejection
        jest.useRealTimers()
    })

    it.each([
        ['invalid json success', response('{not-json', 200)],
        ['missing response id', response({ status: 'pending' }, 200)],
        ['missing response status', response({ id: 'yk-1' }, 200)],
    ])('classifies %s as outcome unknown', async (_label, fetchResponse) => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(fetchResponse)

        await expect(createProvider().createPayment(input)).rejects.toEqual(
            expect.objectContaining({ kind: 'OUTCOME_UNKNOWN' }),
        )
    })

    it.each(['999', '60001', 'abc'])('rejects invalid timeout %s before fetch', async (timeout) => {
        await expect(createProvider({ YOOKASSA_HTTP_TIMEOUT_MS: timeout }).createPayment(input)).rejects.toEqual(
            expect.objectContaining({ kind: 'CONFIGURATION' }),
        )
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it.each([
        [PaymentMerchant.SITE, 'site-shop:site-secret'],
        [PaymentMerchant.BOT, 'bot-shop:bot-secret'],
    ])('gets canonical payment with isolated %s credentials', async (merchant, expectedAuth) => {
        await createProvider().getPayment({ merchant, providerPaymentId: 'yk-1' })
        const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
        expect(url).toBe('https://api.yookassa.ru/v3/payments/yk-1')
        expect(init.method).toBe('GET')
        expect(init.headers['Idempotence-Key']).toBeUndefined()
        expect(Buffer.from(String(init.headers.Authorization).replace('Basic ', ''), 'base64').toString()).toBe(
            expectedAuth,
        )
    })

    it('creates recurrent payment without redirect or save flag and never snapshots the method id', async () => {
        await createProvider().createRecurrentPayment({
            localPaymentId: 'local-2',
            renewalId: 'renewal-1',
            attemptNumber: 1,
            idempotencyKey,
            merchant: PaymentMerchant.BOT,
            amountRub: 399,
            description: 'Продление подписки NOS VPN',
            providerPaymentMethodId: 'provider-method-secret',
            subscriptionId: 'sub-1',
            planId: 'plan-1',
        })
        const init = (global.fetch as jest.Mock).mock.calls[0][1]
        const body = JSON.parse(init.body)
        expect(body).toEqual({
            amount: { value: '399.00', currency: 'RUB' },
            capture: true,
            payment_method_id: 'provider-method-secret',
            description: 'Продление подписки NOS VPN',
            metadata: {
                local_payment_id: 'local-2',
                renewal_id: 'renewal-1',
                subscription_id: 'sub-1',
                plan_id: 'plan-1',
                merchant: PaymentMerchant.BOT,
                recurrent: 'true',
            },
        })
        expect(body.confirmation).toBeUndefined()
        expect(body.save_payment_method).toBeUndefined()
        const result = await createProvider().getPayment({ merchant: PaymentMerchant.BOT, providerPaymentId: 'yk-1' })
        expect(JSON.stringify(result.safeResponseSnapshot)).not.toContain('method-secret-id')
    })
})
