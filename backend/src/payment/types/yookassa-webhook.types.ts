import { YooKassaPaymentResponse } from './yookassa-payment.types'

export const YOOKASSA_WEBHOOK_EVENTS = [
    'payment.waiting_for_capture',
    'payment.succeeded',
    'payment.canceled',
] as const

export type YooKassaWebhookEvent = (typeof YOOKASSA_WEBHOOK_EVENTS)[number]
export type YooKassaWebhookNotification = {
    type: 'notification'
    event: YooKassaWebhookEvent
    object: YooKassaPaymentResponse
}
