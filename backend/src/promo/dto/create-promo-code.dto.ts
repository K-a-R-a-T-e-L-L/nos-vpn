import { TypeValidate, Validate, ValidateEnum } from '@common/decorators/validation.helpers'

import { PromoStatusEnum, PromoTypeEnum } from '../entity/promo.enum'

export class CreatePromoCodeDto {
    @Validate(TypeValidate.STRING)
    code: string

    @Validate(TypeValidate.STRING, { required: false })
    name?: string

    @ValidateEnum(PromoTypeEnum, { required: false })
    type?: PromoTypeEnum

    @Validate(TypeValidate.NUMBER)
    valuePercent: number

    @ValidateEnum(PromoStatusEnum, { required: false })
    status?: PromoStatusEnum

    @Validate(TypeValidate.NUMBER, { required: false })
    maxUses?: number

    @Validate(TypeValidate.NUMBER)
    durationDays: number

    @Validate(TypeValidate.NUMBER)
    devicesLimit: number

    @Validate(TypeValidate.DATE, { required: false })
    startsAt?: Date

    @Validate(TypeValidate.DATE, { required: false })
    expiresAt?: Date
}
