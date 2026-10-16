import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import { AdminSortDirection, trimOrUndefined } from './admin-query.helpers'

export enum AdminRetentionSegment {
    ACTIVE_PAID = 'ACTIVE_PAID',
    ACTIVE_REPEAT = 'ACTIVE_REPEAT',
    REPEAT_EVER = 'REPEAT_EVER',
    ONE_PAYMENT_NO_PAID_ENTITLEMENT = 'ONE_PAYMENT_NO_PAID_ENTITLEMENT',
    TRIAL_ONLY_NO_ENTITLEMENT = 'TRIAL_ONLY_NO_ENTITLEMENT',
    TRIAL_TO_PAID = 'TRIAL_TO_PAID',
}

export enum AdminRetentionSortBy {
    REGISTERED_AT = 'registeredAt',
    FIRST_PAID_AT = 'firstPaidAt',
    LAST_PAID_AT = 'lastPaidAt',
    CASH_PAYMENTS = 'cashPayments',
    SUBSCRIPTION_ENDS_AT = 'subscriptionEndsAt',
}

export class AdminRetentionUsersQueryDto {
    @IsEnum(AdminRetentionSegment) segment: AdminRetentionSegment

    @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => trimOrUndefined(value)) @IsString()
    search?: string

    @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1)
    page = 1

    @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(10) @Max(100)
    pageSize = 25

    @ApiPropertyOptional({ enum: AdminRetentionSortBy, default: AdminRetentionSortBy.REGISTERED_AT }) @IsOptional() @IsEnum(AdminRetentionSortBy)
    sortBy: AdminRetentionSortBy = AdminRetentionSortBy.REGISTERED_AT

    @ApiPropertyOptional({ enum: AdminSortDirection, default: AdminSortDirection.DESC }) @IsOptional() @IsEnum(AdminSortDirection)
    sortDir: AdminSortDirection = AdminSortDirection.DESC
}

export class AdminRetentionCohortsQueryDto {
    @ApiPropertyOptional({ enum: [6, 12, 24], default: 12 }) @IsOptional() @Type(() => Number) @IsInt() @IsIn([6, 12, 24])
    months = 12
}
