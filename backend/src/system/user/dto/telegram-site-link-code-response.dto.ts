import { ApiProperty } from '@nestjs/swagger'

export class TelegramSiteLinkCodeResponseDto {
    @ApiProperty()
    code: string

    @ApiProperty()
    expiresAt: Date
}
