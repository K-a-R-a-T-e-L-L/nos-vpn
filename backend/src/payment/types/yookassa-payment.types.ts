import { YooKassaReceipt } from './yookassa-receipt.types'
import { PaymentMerchant } from '../enum/payment-merchant.enum'

export type YooKassaPaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'

export type YooKassaCreatePaymentRequest = {
    amount: { value: string; currency: 'RUB' }
    capture: true
    confirmation: { type: 'redirect'; return_url: string }
    save_payment_method?: true
    description: string
    metadata: {
        local_payment_id: string
        subscription_id?: string
        plan_id?: string
        merchant: PaymentMerchant
    }
    receipt?: YooKassaReceipt
}

export type YooKassaCreateRecurrentPaymentRequest = {
    amount: { value: string; currency: 'RUB' }
    capture: true
    payment_method_id: string
    description: string
    metadata: {
        local_payment_id: string
        renewal_id: string
        subscription_id: string
        plan_id: string
        merchant: PaymentMerchant
        recurrent: 'true'
    }
    receipt?: YooKassaReceipt
}

export type YooKassaPaymentResponse = {
    id: string
    status: YooKassaPaymentStatus | string
    paid?: boolean
    amount?: { value?: string; currency?: string }
    income_amount?: { value?: string; currency?: string }
    confirmation?: { type?: string; confirmation_url?: string }
    cancellation_details?: { party?: string; reason?: string }
    payment_method?: {
        id?: string
        saved?: boolean
        type?: string
        title?: string
        card?: { last4?: string }
    }
    created_at?: string
    captured_at?: string
    expires_at?: string
    description?: string
    metadata?: Record<string, unknown>
    test?: boolean
}
