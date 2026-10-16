import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class AdminApplyPlanDto {
    @Validate(TypeValidate.UUID)
    planId: string
}

