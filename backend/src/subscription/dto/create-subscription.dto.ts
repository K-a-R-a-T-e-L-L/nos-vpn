import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class CreateSubscriptionDto {
    @Validate(TypeValidate.UUID)
    planId: string
}