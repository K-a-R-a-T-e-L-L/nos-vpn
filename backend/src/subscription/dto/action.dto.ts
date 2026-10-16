import { TypeValidate, Validate } from '@common/decorators/validation.helpers'

import {ActionsEnum} from "../enum/actions.enum";

export class ActionDto {
    @Validate(TypeValidate.STRING)
    action: ActionsEnum

    @Validate(TypeValidate.UUID, { required: false })
    planId?: string

    @Validate(TypeValidate.STRING, { required: false })
    promoCode?: string

    @Validate(TypeValidate.STRING, { required: false })
    referralCode?: string
}
