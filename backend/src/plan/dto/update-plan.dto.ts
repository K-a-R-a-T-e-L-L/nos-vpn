import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class UpdatePlanDto {
    @Validate(TypeValidate.STRING, { required: false })
    code?: string

    @Validate(TypeValidate.STRING, { required: false })
    name?: string

    @Validate(TypeValidate.STRING, { required: false })
    title?: string

    @Validate(TypeValidate.STRING, { required: false })
    description?: string

    @Validate(TypeValidate.NUMBER, { required: false })
    period?: number

    @Validate(TypeValidate.NUMBER, { required: false })
    amount?: number

    @Validate(TypeValidate.BOOLEAN, { required: false })
    isActive?: boolean

    @Validate(TypeValidate.NUMBER, { required: false })
    devicesLimit?: number
}
