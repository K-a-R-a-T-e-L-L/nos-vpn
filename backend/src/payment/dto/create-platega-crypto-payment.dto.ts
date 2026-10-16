import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class CreatePlategaCryptoPaymentDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    planId: string

    @ApiPropertyOptional({ maxLength: 64 })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    promoCode?: string
}
