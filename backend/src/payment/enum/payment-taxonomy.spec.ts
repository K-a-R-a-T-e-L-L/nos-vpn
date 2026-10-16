import { PaymentKind } from './payment-kind.enum'
import { PaymentMerchant } from './payment-merchant.enum'
import { PaymentProvider } from './payment-provider.enum'

describe('payment ledger taxonomy', () => {
    it('keeps external providers separate from internal payment kinds', () => {
        expect(Object.values(PaymentProvider)).toEqual(['YOOKASSA', 'PLATEGA'])
        expect(Object.values(PaymentMerchant)).toEqual(['SITE', 'BOT'])
        expect(Object.values(PaymentKind)).toEqual(['EXTERNAL', 'BONUS_BALANCE', 'PROMO_DISCOUNT'])
        expect(Object.values(PaymentProvider)).not.toContain(PaymentKind.BONUS_BALANCE)
        expect(Object.values(PaymentProvider)).not.toContain(PaymentKind.PROMO_DISCOUNT)
    })
})
