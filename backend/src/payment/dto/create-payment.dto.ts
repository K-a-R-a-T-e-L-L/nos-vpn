import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

import { PaymentStatusEnum } from '../enum/payment-status.enum'

export class CreatePaymentDto {
    @Validate(TypeValidate.NUMBER)
    amount: number

    @Validate(TypeValidate.UUID)
    userId: string

    @Validate(TypeValidate.STRING)
    status: PaymentStatusEnum

    @Validate(TypeValidate.STRING)
    paymentPayId: string

    @Validate(TypeValidate.STRING)
    paymentLink: string

    @Validate(TypeValidate.UUID)
    subscriptionId: string
}
