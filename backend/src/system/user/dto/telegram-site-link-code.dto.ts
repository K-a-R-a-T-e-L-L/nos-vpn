import { TypeValidate, Validate } from '../../../../common/decorators/validation.helpers'

export class TelegramSiteLinkCodeDto {
    @Validate(TypeValidate.STRING)
    code: string
}
