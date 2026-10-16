import { ApiProperty } from '@nestjs/swagger'

export class TelegramLinkResponseDto {
    @ApiProperty()
    linkUrl: string

    @ApiProperty()
    expiresAt: Date
}
