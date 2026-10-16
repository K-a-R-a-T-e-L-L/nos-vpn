import { PlategaPaymentProvider } from './platega-payment.provider'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'

describe('PlategaPaymentProvider', () => {
    const configValues: Record<string, string> = {
        PLATEGA_BASE_URL: 'https://app.platega.io/',
        PLATEGA_MERCHANT_ID: 'merchant-1234',
        PLATEGA_SECRET: 'secret-1234',
        PLATEGA_WEB_MERCHANT_ID: 'web-merchant-1234',
        PLATEGA_WEB_SECRET: 'web-secret-1234',
    }

    const configService = {
        get: jest.fn((key: string) => configValues[key]),
    }

    beforeEach(() => {
        jest.clearAllMocks()
        ;(global as any).fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    transactionId: 'tx-1',
                    status: 'PENDING',
                    url: 'https://pay.platega.io/?id=tx-1',
                    expiresIn: '00:15:00',
                }),
        }))
    })

    it('creates payment only through v2 process endpoint without fixed payment method', async () => {
        const provider = new PlategaPaymentProvider(configService as any)

        const result = await provider.createPayment({
            amount: 500,
            currency: 'RUB',
            description: 'Payment for VPN plan VPN 1',
            returnUrl: 'https://t.me/bot?start=pay_success_payment-1',
            failedUrl: 'https://t.me/bot?start=pay_fail_payment-1',
            idempotencyKey: 'idem-1',
            metadata: {
                local_payment_id: 'payment-1',
                subscription_id: 'sub-1',
                plan_id: 'plan-1',
                user_id: 'user-1',
            },
        })

        expect(global.fetch).toHaveBeenCalledWith(
            'https://app.platega.io/v2/transaction/process',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'X-MerchantId': 'merchant-1234',
                    'X-Secret': 'secret-1234',
                    'Content-Type': 'application/json',
                }),
            }),
        )
        const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
        expect(body).toEqual(
            expect.objectContaining({
                paymentDetails: { amount: 500, currency: 'RUB' },
                description: 'Payment for VPN plan VPN 1',
                return: 'https://t.me/bot?start=pay_success_payment-1',
                failedUrl: 'https://t.me/bot?start=pay_fail_payment-1',
            }),
        )
        expect(body.id).toBeUndefined()
        expect(body.paymentMethod).toBeUndefined()
        expect(JSON.parse(body.payload)).toEqual(
            expect.objectContaining({
                localPaymentId: 'payment-1',
                subscriptionId: 'sub-1',
                planId: 'plan-1',
                userId: 'user-1',
            }),
        )
        expect(result.providerPaymentId).toBe('tx-1')
        expect(result.paymentUrl).toBe('https://pay.platega.io/?id=tx-1')
    })

    it('uses separate web merchant credentials for web payments', async () => {
        const provider = new PlategaPaymentProvider(configService as any)

        await provider.createPayment({
            amount: 500,
            currency: 'RUB',
            description: 'Payment for VPN plan VPN 1',
            returnUrl: 'https://site.example/payment/success/payment-1',
            failedUrl: 'https://site.example/payment/fail/payment-1',
            idempotencyKey: 'idem-web-1',
            merchantProfile: 'web',
            metadata: {
                local_payment_id: 'payment-1',
                subscription_id: 'sub-1',
                plan_id: 'plan-1',
                user_id: 'user-1',
                payment_profile: 'web',
            },
        })

        expect(global.fetch).toHaveBeenCalledWith(
            'https://app.platega.io/v2/transaction/process',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'X-MerchantId': 'web-merchant-1234',
                    'X-Secret': 'web-secret-1234',
                }),
            }),
        )
        const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
        expect(JSON.parse(body.payload)).toEqual(expect.objectContaining({ paymentProfile: 'web' }))
    })

    it('uses the server-owned crypto method only on the specified-method endpoint', async () => {
        const provider = new PlategaPaymentProvider(configService as any)
        await provider.createPayment({
            amount: 500,
            currency: 'RUB',
            description: 'Crypto VPN payment',
            returnUrl: 'https://site.example/success',
            failedUrl: 'https://site.example/fail',
            idempotencyKey: 'crypto-1',
            checkoutMode: PaymentCheckoutMode.PLATEGA_CRYPTO,
            metadata: { local_payment_id: 'payment-1', subscription_id: 'sub-1', plan_id: 'plan-1' },
        })

        expect(global.fetch).toHaveBeenCalledWith(
            'https://app.platega.io/transaction/process',
            expect.objectContaining({ method: 'POST' }),
        )
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual(
            expect.objectContaining({ paymentMethod: 13 }),
        )
    })

    it('rejects an untrusted crypto redirect URL', async () => {
        ;(global as any).fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ transactionId: 'tx-1', url: 'https://evil.example/pay' }),
        }))
        const provider = new PlategaPaymentProvider(configService as any)
        await expect(
            provider.createPayment({
                amount: 500,
                currency: 'RUB',
                description: 'Crypto VPN payment',
                returnUrl: 'https://site.example/success',
                failedUrl: 'https://site.example/fail',
                idempotencyKey: 'crypto-unsafe',
                checkoutMode: PaymentCheckoutMode.PLATEGA_CRYPTO,
                metadata: { local_payment_id: 'payment-1', subscription_id: 'sub-1', plan_id: 'plan-1' },
            }),
        ).rejects.toThrow('ENTITY_CREATION_FAIL')
    })

    it('verifies webhook headers and maps known and unknown Platega statuses safely', () => {
        const provider = new PlategaPaymentProvider(configService as any)

        expect(
            provider.verifyWebhook(
                { id: 'tx-1', status: 'CONFIRMED' },
                { 'x-merchantid': 'merchant-1234', 'x-secret': 'secret-1234' },
            ),
        ).toBe(true)

        expect(provider.mapProviderStatusToLocalStatus('CONFIRMED')).toBe(PaymentStatusEnum.SUCCEEDED)
        expect(provider.mapProviderStatusToLocalStatus('CANCELED')).toBe(PaymentStatusEnum.CANCELED)
        expect(provider.mapProviderStatusToLocalStatus('CHARGEBACKED')).toBe(PaymentStatusEnum.REFUNDED)
        expect(provider.mapProviderStatusToLocalStatus('PENDING')).toBe(PaymentStatusEnum.PENDING)
        expect(provider.mapProviderStatusToLocalStatus('SOMETHING_NEW')).toBe(PaymentStatusEnum.PENDING)
    })

    it('rejects webhook with invalid secret', () => {
        const provider = new PlategaPaymentProvider(configService as any)

        expect(() =>
            provider.verifyWebhook(
                { id: 'tx-1', status: 'CONFIRMED' },
                { 'x-merchantid': 'merchant-1234', 'x-secret': 'wrong-secret' },
            ),
        ).toThrow('FORBIDDEN')
    })

    it('resolves callback merchant credentials without requiring a one-time payment body', () => {
        const provider = new PlategaPaymentProvider(configService as any)

        expect(
            provider.verifyMerchantHeaders({
                'X-MerchantId': 'web-merchant-1234',
                'X-Secret': 'web-secret-1234',
            }),
        ).toBe('web')
    })

    it('checks payment status through GET transaction endpoint', async () => {
        ;(global as any).fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    id: 'tx-1',
                    status: 'CONFIRMED',
                    paymentDetails: { amount: 500, currency: 'RUB' },
                    payload: JSON.stringify({ localPaymentId: 'payment-1' }),
                }),
        }))
        const provider = new PlategaPaymentProvider(configService as any)

        const result = await provider.getPaymentStatus('tx-1')

        expect(global.fetch).toHaveBeenCalledWith(
            'https://app.platega.io/transaction/tx-1',
            expect.objectContaining({ method: 'GET' }),
        )
        expect(result.status).toBe(PaymentStatusEnum.SUCCEEDED)
        expect(result.providerPaymentId).toBe('tx-1')
        expect(result.metadata).toEqual({ localPaymentId: 'payment-1' })
    })
})
