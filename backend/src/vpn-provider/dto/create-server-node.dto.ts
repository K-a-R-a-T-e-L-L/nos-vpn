import { TypeValidate, Validate, ValidateEnum } from '@common/decorators/validation.helpers'

import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'

export class CreateServerNodeDto {
    @Validate(TypeValidate.STRING)
    code: string

    @Validate(TypeValidate.STRING)
    name: string

    @Validate(TypeValidate.STRING)
    region: string

    @ValidateEnum(VpnProviderTypeEnum)
    providerType: VpnProviderTypeEnum

    @Validate(TypeValidate.URL)
    baseUrl: string

    @Validate(TypeValidate.BOOLEAN, { required: false })
    isActive?: boolean

    @Validate(TypeValidate.NUMBER, { required: false })
    priority?: number

    @Validate(TypeValidate.STRING, { required: false })
    defaultAccessKey?: string
}
