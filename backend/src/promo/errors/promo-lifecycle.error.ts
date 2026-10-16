export type PromoLifecycleErrorCode =
    | 'PROMO_LIFECYCLE_PAYMENT_NOT_FOUND'
    | 'PROMO_LIFECYCLE_PAYMENT_MISMATCH'
    | 'PROMO_LIFECYCLE_USAGE_NOT_FOUND'
    | 'PROMO_LIFECYCLE_USAGE_CANCELED'
    | 'PROMO_LIFECYCLE_SUBSCRIPTION_MISMATCH'

export class PromoLifecycleError extends Error {
    constructor(readonly code: PromoLifecycleErrorCode) {
        super(code)
        this.name = 'PromoLifecycleError'
    }
}
