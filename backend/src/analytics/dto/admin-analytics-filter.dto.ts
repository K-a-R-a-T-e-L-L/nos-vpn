import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Length } from 'class-validator'

import { AdminMerchantFilter, AdminProviderFilter, booleanOrUndefined, trimOrUndefined, upperOrUndefined } from './admin-query.helpers'
import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'

export class AdminAnalyticsFilterDto {
    @ApiPropertyOptional({ enum: AdminAnalyticsPeriodPreset, default: AdminAnalyticsPeriodPreset.LAST_30_DAYS })
    @IsOptional()
    @IsEnum(AdminAnalyticsPeriodPreset)
    preset: AdminAnalyticsPeriodPreset = AdminAnalyticsPeriodPreset.LAST_30_DAYS

    @ApiPropertyOptional({ example: '2026-08-01' })
    @IsOptional()
    @IsISO8601({ strict: true })
    dateFrom?: string

    @ApiPropertyOptional({ example: '2026-08-02' })
    @IsOptional()
    @IsISO8601({ strict: true })
    dateTo?: string

    @ApiPropertyOptional({ enum: AdminProviderFilter, default: AdminProviderFilter.ALL })
    @IsOptional()
    @IsEnum(AdminProviderFilter)
    provider: AdminProviderFilter = AdminProviderFilter.ALL

    @ApiPropertyOptional({ enum: AdminMerchantFilter, default: AdminMerchantFilter.ALL })
    @IsOptional()
    @IsEnum(AdminMerchantFilter)
    merchant: AdminMerchantFilter | PaymentMerchant = AdminMerchantFilter.ALL

    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID('4')
    planId?: string

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => upperOrUndefined(value))
    @IsString()
    @Length(1, 120)
    promoCode?: string

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => trimOrUndefined(value))
    @IsString()
    @Length(1, 120)
    userSearch?: string

    @ApiPropertyOptional({ type: Boolean })
    @IsOptional()
    @Transform(({ obj, key }) => booleanOrUndefined(obj[key]))
    @IsBoolean()
    referred?: boolean
}
