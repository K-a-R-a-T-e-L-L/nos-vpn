import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'

export type PaymentProviderErrorKind = 'CONFIGURATION' | 'TERMINAL_REQUEST' | 'OUTCOME_UNKNOWN'

export type SafePaymentProviderErrorFields = {
    statusCode?: number
    providerCode?: string
    providerType?: string
    providerDescription?: string
    providerParameter?: string
    providerRequestIdMasked?: string
}

export class PaymentProviderError extends Error {
    readonly provider: PaymentProvider
    readonly merchant?: PaymentMerchant
    readonly kind: PaymentProviderErrorKind
    readonly statusCode?: number
    readonly providerCode?: string
    readonly providerType?: string
    readonly providerDescription?: string
    readonly providerParameter?: string
    readonly providerRequestIdMasked?: string

    constructor(input: {
        message: string
        provider: PaymentProvider
        merchant?: PaymentMerchant
        kind: PaymentProviderErrorKind
        statusCode?: number
        providerCode?: string
        providerType?: string
        providerDescription?: string
        providerParameter?: string
        providerRequestIdMasked?: string
        cause?: unknown
    }) {
        super(input.message)
        this.name = 'PaymentProviderError'
        this.provider = input.provider
        this.merchant = input.merchant
        this.kind = input.kind
        this.statusCode = input.statusCode
        this.providerCode = input.providerCode
        this.providerType = input.providerType
        this.providerDescription = input.providerDescription
        this.providerParameter = input.providerParameter
        this.providerRequestIdMasked = input.providerRequestIdMasked
        if (input.cause !== undefined) {
            Object.defineProperty(this, 'cause', {
                value: input.cause,
                configurable: true,
                writable: true,
            })
        }
    }
}
