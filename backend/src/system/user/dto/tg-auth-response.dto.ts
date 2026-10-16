import { ApiProperty } from '@nestjs/swagger'

export class TgAuthResponseDto {
    @ApiProperty()
    accessToken: string

    @ApiProperty()
    isNewUser: boolean
}
