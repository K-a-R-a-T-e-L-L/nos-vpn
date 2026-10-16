import { ApiProperty } from '@nestjs/swagger'

export class TelegramAuthLinkResponseDto {
    @ApiProperty()
    linkUrl: string

    @ApiProperty()
    requestToken: string

    @ApiProperty()
    expiresAt: Date
}
