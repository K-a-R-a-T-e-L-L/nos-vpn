import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentMethodConsentSource } from '../types/payment-method-consent-source'
import { YooKassaReceipt } from '../types/yookassa-receipt.types'

export type CreateExternalPaymentInput = {
    localPaymentId: string
    idempotencyKey: string
    merchant: PaymentMerchant
    amountRub: number
    description: string
    returnUrl: string
    subscriptionId?: string | null
    planId?: string | null
    receipt?: YooKassaReceipt | null
    paymentMethodConsentSource: PaymentMethodConsentSource
}

export type GetExternalPaymentInput = {
    providerPaymentId: string
    merchant: PaymentMerchant
}

export type CreateRecurrentPaymentInput = {
    localPaymentId: string
    renewalId: string
    attemptNumber: number
    idempotencyKey: string
    merchant: PaymentMerchant
    amountRub: number
    description: string
    providerPaymentMethodId: string
    subscriptionId: string
    planId: string
    receipt?: YooKassaReceipt | null
}

export type CreatedExternalPayment = {
    provider: PaymentProvider
    merchant: PaymentMerchant
    providerPaymentId: string
    status: PaymentStatusEnum
    externalStatus: string
    confirmationUrl: string | null
    providerInvoiceId: string | null
    amountValue?: string | null
    currency?: string | null
    incomeAmountValue?: string | null
    incomeAmountCurrency?: string | null
    metadata?: Record<string, unknown>
    createdAt?: string | null
    capturedAt?: string | null
    cancellationReason?: string | null
    paymentMethod: {
        id: string | null
        saved: boolean
        type: string | null
        title?: string | null
        last4?: string | null
    } | null
    safeResponseSnapshot: Record<string, unknown>
}

export interface ExternalPaymentProvider {
    readonly provider: PaymentProvider
    createPayment(input: CreateExternalPaymentInput): Promise<CreatedExternalPayment>
    getPayment(input: GetExternalPaymentInput): Promise<CreatedExternalPayment>
    createRecurrentPayment(input: CreateRecurrentPaymentInput): Promise<CreatedExternalPayment>
}
