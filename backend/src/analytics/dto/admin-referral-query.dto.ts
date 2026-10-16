import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsArray, IsEnum, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator'

import { AdminMerchantFilter, AdminSortDirection, arrayValue, trimOrUndefined, upperOrUndefined } from './admin-query.helpers'
import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { ReferralRewardStatusEnum } from '../../referral/entity/referral-bonus-ledger.entity'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'

export enum AdminReferralSortBy {
    REGISTERED_AT = 'registeredAt',
    FIRST_PAID_AT = 'firstPaidAt',
    SUCCESSFUL_REVENUE = 'successfulRevenue',
    AWARDED_BONUS = 'awardedBonus',
}

export class AdminReferralQueryDto {
    @ApiPropertyOptional({ enum: AdminAnalyticsPeriodPreset, default: AdminAnalyticsPeriodPreset.LAST_30_DAYS })
    @IsOptional() @IsEnum(AdminAnalyticsPeriodPreset)
    preset: AdminAnalyticsPeriodPreset = AdminAnalyticsPeriodPreset.LAST_30_DAYS

    @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true })
    dateFrom?: string

    @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true })
    dateTo?: string

    @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => trimOrUndefined(value)) @IsString() @Length(1, 120)
    referrerSearch?: string

    @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => trimOrUndefined(value)) @IsString() @Length(1, 120)
    invitedSearch?: string

    @ApiPropertyOptional({ enum: ReferralRewardStatusEnum, isArray: true })
    @IsOptional() @Transform(({ value }) => arrayValue(value)) @IsArray() @IsEnum(ReferralRewardStatusEnum, { each: true })
    ledgerStatus?: ReferralRewardStatusEnum[]

    @ApiPropertyOptional({ enum: AdminMerchantFilter, default: AdminMerchantFilter.ALL })
    @IsOptional() @IsEnum(AdminMerchantFilter)
    merchant: AdminMerchantFilter | PaymentMerchant = AdminMerchantFilter.ALL

    @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4')
    planId?: string

    @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => upperOrUndefined(value)) @IsString() @Length(1, 120)
    promoCode?: string

    @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1)
    page = 1

    @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(10) @Max(100)
    pageSize = 25

    @ApiPropertyOptional({ enum: AdminReferralSortBy, default: AdminReferralSortBy.REGISTERED_AT })
    @IsOptional() @IsEnum(AdminReferralSortBy)
    sortBy: AdminReferralSortBy = AdminReferralSortBy.REGISTERED_AT

    @ApiPropertyOptional({ enum: AdminSortDirection, default: AdminSortDirection.DESC })
    @IsOptional() @IsEnum(AdminSortDirection)
    sortDir: AdminSortDirection = AdminSortDirection.DESC
}
