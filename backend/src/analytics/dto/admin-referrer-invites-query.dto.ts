import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator'

import { AdminSortDirection, trimOrUndefined } from './admin-query.helpers'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'

export enum AdminReferrerInvitePaidState {
    ALL = 'ALL',
    EVER_PAID = 'EVER_PAID',
    NEVER_PAID = 'NEVER_PAID',
}

export enum AdminReferrerInviteSortBy {
    REGISTERED_AT = 'registeredAt',
    FIRST_PAID_AT = 'firstPaidAt',
    SUCCESSFUL_REVENUE = 'successfulRevenue',
}

export class AdminReferrerInvitesQueryDto {
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
    invitedSearch?: string

    @ApiPropertyOptional({ enum: AdminReferrerInvitePaidState, default: AdminReferrerInvitePaidState.ALL })
    @IsOptional()
    @IsEnum(AdminReferrerInvitePaidState)
    paidState: AdminReferrerInvitePaidState = AdminReferrerInvitePaidState.ALL

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

    @ApiPropertyOptional({ enum: AdminReferrerInviteSortBy, default: AdminReferrerInviteSortBy.REGISTERED_AT })
    @IsOptional()
    @IsEnum(AdminReferrerInviteSortBy)
    sortBy: AdminReferrerInviteSortBy = AdminReferrerInviteSortBy.REGISTERED_AT

    @ApiPropertyOptional({ enum: AdminSortDirection, default: AdminSortDirection.DESC })
    @IsOptional()
    @IsEnum(AdminSortDirection)
    sortDir: AdminSortDirection = AdminSortDirection.DESC
}
