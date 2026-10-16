import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class TgAuthDto {
    @Validate(TypeValidate.STRING)
    rawInitData: string
}
