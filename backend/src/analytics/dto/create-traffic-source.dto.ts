import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateTrafficSourceDto {
    @ApiProperty()
    @IsString()
    @MaxLength(120)
    code: string

    @ApiProperty()
    @IsString()
    @MaxLength(160)
    name: string

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string

    @ApiPropertyOptional({ default: '/earn' })
    @IsOptional()
    @IsString()
    websitePath?: string

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}
