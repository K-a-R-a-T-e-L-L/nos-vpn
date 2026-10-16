import { ApiProperty } from '@nestjs/swagger'

export class EmailAuthResponseDto {
    @ApiProperty()
    accessToken: string

    @ApiProperty()
    isNewUser: boolean
}
