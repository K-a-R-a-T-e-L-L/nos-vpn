import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsOptional, IsUUID } from 'class-validator'

export class AdminConfigureSubscriptionDto {
    @ApiProperty()
    @IsUUID()
    planId: string

    @ApiProperty({ required: false })
    @IsOptional()
    @IsDateString()
    endsAt?: string
}
