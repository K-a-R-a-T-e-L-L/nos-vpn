import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class ClaimAttributionDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(120)
    sourceCode?: string

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(500)
    landingPath?: string
}
