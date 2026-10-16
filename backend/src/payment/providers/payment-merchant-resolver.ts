import { PaymentMerchant } from '../enum/payment-merchant.enum'

export type LegacyPaymentMerchantProfile = 'bot' | 'web'

export function resolvePaymentMerchant(merchantProfile: LegacyPaymentMerchantProfile): PaymentMerchant {
    return merchantProfile === 'web' ? PaymentMerchant.SITE : PaymentMerchant.BOT
}
