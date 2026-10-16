export type PaymentAdminNotificationErrorCode =
    | 'ADMIN_CHAT_NOT_CONFIGURED'
    | 'TELEGRAM_FORBIDDEN'
    | 'TELEGRAM_CHAT_MIGRATED'
    | 'TELEGRAM_RATE_LIMITED'
    | 'TELEGRAM_TEMPORARY_ERROR'
    | 'TELEGRAM_UNKNOWN_ERROR'
    | 'PAYMENT_CONTEXT_NOT_FOUND'

export class PaymentAdminNotificationError extends Error {
    constructor(
        readonly code: PaymentAdminNotificationErrorCode,
        readonly terminal: boolean,
    ) {
        super(code)
        this.name = 'PaymentAdminNotificationError'
    }
}
