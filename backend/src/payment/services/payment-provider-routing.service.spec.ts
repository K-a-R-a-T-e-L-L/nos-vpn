import { PaymentProviderRoutingService } from './payment-provider-routing.service'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'

describe('PaymentProviderRoutingService', () => {
    function create(primary: PaymentProvider = PaymentProvider.PLATEGA) {
        const policy = {
            getPrimaryProvider: jest.fn((_userId?: string) => primary),
            isCheckoutProviderAvailable: jest.fn(() => true),
            assertProviderAvailable: jest.fn(),
        }
        const service = new PaymentProviderRoutingService({ get: jest.fn() } as any, policy as any)
        return { service, policy }
    }

    it('routes ordinary ONE_TIME through the configured primary provider', () => {
        const platega = create(PaymentProvider.PLATEGA)
        expect(platega.service.resolveCheckoutProvider(PaymentCheckoutMode.ONE_TIME, 'user-1')).toBe(
            PaymentProvider.PLATEGA,
        )
        expect(platega.policy.getPrimaryProvider).toHaveBeenCalledWith('user-1')

        const yookassa = create(PaymentProvider.YOOKASSA)
        expect(yookassa.service.resolveCheckoutProvider(PaymentCheckoutMode.ONE_TIME, 'user-2')).toBe(
            PaymentProvider.YOOKASSA,
        )
        expect(yookassa.policy.getPrimaryProvider).toHaveBeenCalledWith('user-2')
    })

    it('keeps crypto pinned to Platega regardless of primary provider', () => {
        const { service, policy } = create(PaymentProvider.YOOKASSA)
        expect(service.resolveCheckoutProvider(PaymentCheckoutMode.PLATEGA_CRYPTO, 'user-1')).toBe(
            PaymentProvider.PLATEGA,
        )
        expect(policy.getPrimaryProvider).not.toHaveBeenCalled()
    })
})
