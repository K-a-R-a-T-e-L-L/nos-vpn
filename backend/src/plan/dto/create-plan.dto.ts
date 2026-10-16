import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class CreatePlanDto {
    @Validate(TypeValidate.STRING, { required: false })
    code?: string

    @Validate(TypeValidate.STRING)
    name: string

    @Validate(TypeValidate.STRING, { required: false })
    title?: string

    @Validate(TypeValidate.STRING, { required: false })
    description?: string

    @Validate(TypeValidate.NUMBER)
    period: number

    @Validate(TypeValidate.NUMBER)
    amount: number

    @Validate(TypeValidate.BOOLEAN, { required: false })
    isActive?: boolean

    @Validate(TypeValidate.NUMBER, { required: false })
    devicesLimit?: number
}
