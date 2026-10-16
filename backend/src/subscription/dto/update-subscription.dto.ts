import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

import { StatusesEnum } from '../enum/statuses.enum'

export class UpdateSubscriptionDto {
    @Validate(TypeValidate.ENUM, { required: false, enum: StatusesEnum })
    status?: StatusesEnum

    @Validate(TypeValidate.UUID, { required: false })
    planId?: string

    @Validate(TypeValidate.STRING, { required: false })
    yookassaPaymentId?: string

    @Validate(TypeValidate.DATE, { required: false })
    nextPayAt?: Date
}