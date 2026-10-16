import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

class UpsertPlanCatalogItemDto {
    @Validate(TypeValidate.NUMBER)
    period: number

    @Validate(TypeValidate.NUMBER)
    devicesLimit: number

    @Validate(TypeValidate.NUMBER)
    amount: number

    @Validate(TypeValidate.BOOLEAN, { required: false })
    isActive?: boolean
}

export class UpsertPlanCatalogDto {
    @Validate(TypeValidate.ARRAY)
    plans: UpsertPlanCatalogItemDto[]
}
