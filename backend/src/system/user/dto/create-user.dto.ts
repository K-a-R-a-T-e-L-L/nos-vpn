import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class CreateUserDto {
    @Validate(TypeValidate.STRING)
    telegramId: number

    @Validate(TypeValidate.STRING, { required: false })
    telegramUsername?: string

    @Validate(TypeValidate.STRING)
    telegramFirstName: string

    @Validate(TypeValidate.STRING, { required: false })
    telegramLastName?: string

    @Validate(TypeValidate.BOOLEAN, { required: false })
    telegramIsPremium?: boolean

    @Validate(TypeValidate.STRING, { required: false })
    telegramLanguageCode?: string
}
