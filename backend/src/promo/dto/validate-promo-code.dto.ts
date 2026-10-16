import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class ValidatePromoCodeDto {
    @Validate(TypeValidate.STRING)
    code: string

    @Validate(TypeValidate.UUID, { required: false })
    planId?: string
}
