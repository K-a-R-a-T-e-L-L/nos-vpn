import { ApiProperty } from '@nestjs/swagger'

export class TelegramAuthStatusResponseDto {
    @ApiProperty({ enum: ['pending', 'confirmed'] })
    status: 'pending' | 'confirmed'

    @ApiProperty({ required: false })
    accessToken?: string

    @ApiProperty({ required: false })
    isNewUser?: boolean
}
