import { HttpException, HttpStatus } from '@nestjs/common'

export type PromoValidationErrorCode =
    | 'PROMO_NOT_FOUND'
    | 'PROMO_INACTIVE'
    | 'PROMO_NOT_STARTED'
    | 'PROMO_EXPIRED'
    | 'PROMO_LIMIT_REACHED'
    | 'PROMO_ALREADY_USED'
    | 'PROMO_RESERVATION_CONFLICT'

export class PromoValidationError extends HttpException {
    constructor(readonly code: PromoValidationErrorCode) {
        const status = code === 'PROMO_NOT_FOUND' ? HttpStatus.NOT_FOUND : HttpStatus.FORBIDDEN
        super(
            {
                statusCode: status,
                error: status === HttpStatus.NOT_FOUND ? 'Not Found' : 'Forbidden',
                message: code,
            },
            status,
        )
        this.name = 'PromoValidationError'
    }
}
