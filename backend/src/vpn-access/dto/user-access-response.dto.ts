import { ApiProperty } from '@nestjs/swagger'

class RawAccessConfigDto {
    @ApiProperty({ required: false, nullable: true })
    providerExternalId?: string | null

    @ApiProperty({ required: false, nullable: true })
    providerClientKey?: string | null

    @ApiProperty({ required: false, nullable: true })
    inboundKey?: string | null

    @ApiProperty({ required: false, nullable: true, type: Object })
    configPayload?: Record<string, any> | null
}

export class UserAccessResponseDto {
    @ApiProperty()
    status: string

    @ApiProperty({ required: false, nullable: true })
    plan?: string | null

    @ApiProperty({ required: false, nullable: true })
    planCode?: string | null

    @ApiProperty({ required: false, nullable: true })
    planTitle?: string | null

    @ApiProperty({ required: false, nullable: true })
    planDescription?: string | null

    @ApiProperty({ required: false, nullable: true })
    expiresAt?: Date | null

    @ApiProperty({ required: false, nullable: true })
    graceEndsAt?: Date | null

    @ApiProperty({ required: false, nullable: true })
    subscriptionUrl?: string | null

    @ApiProperty({ required: false, nullable: true })
    qrPayload?: string | null

    @ApiProperty({ required: false, nullable: true, type: RawAccessConfigDto })
    rawConfig?: RawAccessConfigDto | null

    @ApiProperty()
    deliveryMode: string

    @ApiProperty()
    instructions: string
}
