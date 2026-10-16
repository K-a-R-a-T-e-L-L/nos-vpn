import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class CreateSupportMessageDto {
    @ApiProperty({ example: 'Здравствуйте, помогите подключиться' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    text: string
}
