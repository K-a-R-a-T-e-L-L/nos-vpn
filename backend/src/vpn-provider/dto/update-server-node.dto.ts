import { TypeValidate, Validate, ValidateEnum } from '@common/decorators/validation.helpers'

import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'

export class UpdateServerNodeDto {
    @Validate(TypeValidate.STRING, { required: false })
    code?: string

    @Validate(TypeValidate.STRING, { required: false })
    name?: string

    @Validate(TypeValidate.STRING, { required: false })
    region?: string

    @ValidateEnum(VpnProviderTypeEnum, { required: false })
    providerType?: VpnProviderTypeEnum

    @Validate(TypeValidate.URL, { required: false })
    baseUrl?: string

    @Validate(TypeValidate.BOOLEAN, { required: false })
    isActive?: boolean

    @Validate(TypeValidate.NUMBER, { required: false })
    priority?: number

    @Validate(TypeValidate.STRING, { required: false })
    defaultAccessKey?: string
}
