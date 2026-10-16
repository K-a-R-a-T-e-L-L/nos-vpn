import { PaymentProviderPolicyService } from './payment-provider-policy.service'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentProviderError } from '../errors/payment-provider.error'

describe('PaymentProviderPolicyService', () => {
    function createService(values: Record<string, string | undefined> = {}) {
        return new PaymentProviderPolicyService({
            get: jest.fn((key: string) => values[key]),
        } as any)
    }

    it.each([
        [{}, PaymentProvider.PLATEGA],
        [{ PAYMENT_PRIMARY_PROVIDER: 'PLATEGA' }, PaymentProvider.PLATEGA],
        [{ PAYMENT_PRIMARY_PROVIDER: 'YOOKASSA' }, PaymentProvider.YOOKASSA],
        [{ PAYMENT_PRIMARY_PROVIDER: 'yookassa' }, PaymentProvider.YOOKASSA],
    ])('resolves primary provider from %o', (values, expected) => {
        expect(createService(values).getPrimaryProvider()).toBe(expected)
    })

    it('rejects an unknown primary provider without inventing a merchant', () => {
        expect.assertions(3)
        try {
            createService({ PAYMENT_PRIMARY_PROVIDER: 'unknown' }).getPrimaryProvider()
        } catch (error) {
            expect(error).toBeInstanceOf(PaymentProviderError)
            expect((error as PaymentProviderError).kind).toBe('CONFIGURATION')
            expect((error as PaymentProviderError).merchant).toBeUndefined()
        }
    })

    it('keeps YooKassa disabled by default and allows Platega', () => {
        const service = createService()

        expect(service.isYooKassaEnabled()).toBe(false)
        expect(() => service.assertProviderAvailable(PaymentProvider.PLATEGA)).not.toThrow()
        expect(() => service.assertProviderAvailable(PaymentProvider.YOOKASSA)).toThrow(
            expect.objectContaining({ kind: 'CONFIGURATION' }),
        )
    })

    it('allows YooKassa only when the flag is exactly true', () => {
        const service = createService({ PAYMENT_YOOKASSA_ENABLED: 'true' })

        expect(service.isYooKassaEnabled()).toBe(true)
        expect(() => service.assertProviderAvailable(PaymentProvider.YOOKASSA)).not.toThrow()
    })

    it('reports checkout availability from the YooKassa runtime gate only', () => {
        expect(createService().isCheckoutProviderAvailable(PaymentProvider.YOOKASSA)).toBe(false)
        expect(
            createService({ PAYMENT_YOOKASSA_ENABLED: 'true', PAYMENT_PRIMARY_PROVIDER: 'PLATEGA' }).isCheckoutProviderAvailable(
                PaymentProvider.YOOKASSA,
            ),
        ).toBe(true)
        expect(createService().isCheckoutProviderAvailable(PaymentProvider.PLATEGA)).toBe(true)
    })

    it('routes only explicit server-side canary users while the global primary remains Platega', () => {
        const service = createService({
            PAYMENT_PRIMARY_PROVIDER: 'PLATEGA',
            PAYMENT_YOOKASSA_ENABLED: 'true',
            PAYMENT_YOOKASSA_CANARY_USER_IDS: 'user-a,user-b',
        })
        expect(service.getPrimaryProvider('user-a')).toBe(PaymentProvider.YOOKASSA)
        expect(service.getPrimaryProvider('other')).toBe(PaymentProvider.PLATEGA)
        expect(service.getPrimaryProvider()).toBe(PaymentProvider.PLATEGA)
    })
})
