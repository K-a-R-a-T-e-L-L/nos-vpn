import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean } from 'class-validator'

export class UpdateUserBlockDto {
    @ApiProperty()
    @IsBoolean()
    isBlocked: boolean
}
