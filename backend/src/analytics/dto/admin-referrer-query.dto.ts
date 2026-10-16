import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsISO8601, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator'

import { AdminSortDirection, booleanOrUndefined, trimOrUndefined } from './admin-query.helpers'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'

export enum AdminReferrerMetricScope {
    LIFETIME = 'LIFETIME',
    PERIOD = 'PERIOD',
}

export enum AdminReferrerSortBy {
    INVITED_USERS = 'invitedUsers',
    PAYING_INVITED_USERS = 'payingInvitedUsers',
    REFERRED_GROSS_REVENUE = 'referredGrossRevenue',
    LIFETIME_AWARDED_BONUS = 'lifetimeAwardedBonus',
    CURRENT_WALLET_BALANCE = 'currentWalletBalance',
    LAST_REFERRAL_AT = 'lastReferralAt',
}

export class AdminReferrerQueryDto {
    @ApiPropertyOptional({ enum: AdminAnalyticsPeriodPreset, default: AdminAnalyticsPeriodPreset.LAST_30_DAYS })
    @IsOptional()
    @IsEnum(AdminAnalyticsPeriodPreset)
    preset: AdminAnalyticsPeriodPreset = AdminAnalyticsPeriodPreset.LAST_30_DAYS

    @ApiPropertyOptional()
    @IsOptional()
    @IsISO8601({ strict: true })
    dateFrom?: string

    @ApiPropertyOptional()
    @IsOptional()
    @IsISO8601({ strict: true })
    dateTo?: string

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => trimOrUndefined(value))
    @IsString()
    @Length(1, 120)
    referrerSearch?: string

    @ApiPropertyOptional({ type: Boolean })
    @IsOptional()
    @Transform(({ obj, key }) => booleanOrUndefined(obj[key]))
    @IsBoolean()
    onlyWithInvited?: boolean

    @ApiPropertyOptional({ type: Boolean })
    @IsOptional()
    @Transform(({ obj, key }) => booleanOrUndefined(obj[key]))
    @IsBoolean()
    onlyWithPayingInvited?: boolean

    @ApiPropertyOptional({ enum: AdminReferrerMetricScope, default: AdminReferrerMetricScope.LIFETIME })
    @IsOptional()
    @IsEnum(AdminReferrerMetricScope)
    metricScope: AdminReferrerMetricScope = AdminReferrerMetricScope.LIFETIME

    @ApiPropertyOptional({ default: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1

    @ApiPropertyOptional({ default: 25 })
    @Type(() => Number)
    @IsInt()
    @Min(10)
    @Max(100)
    pageSize = 25

    @ApiPropertyOptional({ enum: AdminReferrerSortBy, default: AdminReferrerSortBy.INVITED_USERS })
    @IsOptional()
    @IsEnum(AdminReferrerSortBy)
    sortBy: AdminReferrerSortBy = AdminReferrerSortBy.INVITED_USERS

    @ApiPropertyOptional({ enum: AdminSortDirection, default: AdminSortDirection.DESC })
    @IsOptional()
    @IsEnum(AdminSortDirection)
    sortDir: AdminSortDirection = AdminSortDirection.DESC
}
