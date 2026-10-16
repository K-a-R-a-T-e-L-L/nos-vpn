import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class AdminReplySupportDto {
    @ApiProperty({ example: 'Здравствуйте. Откройте раздел доступа в кабинете и отправьте скриншот ошибки, если проблема останется.' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    text: string
}
