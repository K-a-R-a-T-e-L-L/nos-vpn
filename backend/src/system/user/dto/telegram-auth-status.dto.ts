import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

export class TelegramAuthStatusDto {
    @Validate(TypeValidate.STRING)
    requestToken: string
}
