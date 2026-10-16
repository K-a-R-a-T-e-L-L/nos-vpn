import { resolvePaymentMerchant } from './payment-merchant-resolver'
import { PaymentMerchant } from '../enum/payment-merchant.enum'

describe('resolvePaymentMerchant', () => {
    it.each([
        ['web', PaymentMerchant.SITE],
        ['bot', PaymentMerchant.BOT],
    ] as const)('maps %s to %s', (profile, merchant) => {
        expect(resolvePaymentMerchant(profile)).toBe(merchant)
    })
})
