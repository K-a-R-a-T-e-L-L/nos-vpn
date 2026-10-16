import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator'

import { AdminSortDirection, booleanOrUndefined, trimOrUndefined, upperOrUndefined } from '../../../analytics/dto/admin-query.helpers'
import { RolesEnum } from '../enum/roles.enum'

export enum AdminUserAuthChannel { ALL = 'ALL', EMAIL = 'EMAIL', TELEGRAM = 'TELEGRAM', BOTH = 'BOTH' }
export enum AdminUserSubscriptionState { ALL = 'ALL', ACTIVE = 'ACTIVE', EXPIRED = 'EXPIRED', NONE = 'NONE' }
export enum AdminUserPaymentState { ALL = 'ALL', EVER_PAID = 'EVER_PAID', NEVER_PAID = 'NEVER_PAID' }
export enum AdminUserReferralState { ALL = 'ALL', IS_REFERRER = 'IS_REFERRER', WAS_REFERRED = 'WAS_REFERRED' }
export enum AdminUserSortBy {
    CREATED_AT = 'createdAt', EMAIL = 'email', SUBSCRIPTION_ENDS_AT = 'subscriptionEndsAt',
    SUCCESSFUL_PAID_TOTAL = 'successfulPaidTotal', LAST_PAID_AT = 'lastPaidAt',
}

export class AdminUserQueryDto {
    @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => trimOrUndefined(value)) @IsString() @Length(1, 120)
    search?: string

    @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4')
    userId?: string

    @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => trimOrUndefined(value)) @IsString() @Matches(/^\d+$/) @Length(1, 32)
    telegramId?: string

    @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true })
    registeredFrom?: string

    @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true })
    registeredTo?: string

    @ApiPropertyOptional({ enum: RolesEnum }) @IsOptional() @IsEnum(RolesEnum)
    role?: RolesEnum

    @ApiPropertyOptional({ type: Boolean }) @IsOptional() @Transform(({ obj, key }) => booleanOrUndefined(obj[key])) @IsBoolean()
    blocked?: boolean

    @ApiPropertyOptional({ enum: AdminUserAuthChannel, default: AdminUserAuthChannel.ALL }) @IsOptional() @IsEnum(AdminUserAuthChannel)
    authChannel: AdminUserAuthChannel = AdminUserAuthChannel.ALL

    @ApiPropertyOptional({ enum: AdminUserSubscriptionState, default: AdminUserSubscriptionState.ALL }) @IsOptional() @IsEnum(AdminUserSubscriptionState)
    subscriptionState: AdminUserSubscriptionState = AdminUserSubscriptionState.ALL

    @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4')
    planId?: string

    @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true })
    expiresBefore?: string

    @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true })
    expiresAfter?: string

    @ApiPropertyOptional({ type: Boolean }) @IsOptional() @Transform(({ obj, key }) => booleanOrUndefined(obj[key])) @IsBoolean()
    autoRenewEnabled?: boolean

    @ApiPropertyOptional({ enum: AdminUserPaymentState, default: AdminUserPaymentState.ALL }) @IsOptional() @IsEnum(AdminUserPaymentState)
    paymentState: AdminUserPaymentState = AdminUserPaymentState.ALL

    @ApiPropertyOptional({ enum: AdminUserReferralState, default: AdminUserReferralState.ALL }) @IsOptional() @IsEnum(AdminUserReferralState)
    referralState: AdminUserReferralState = AdminUserReferralState.ALL

    @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => upperOrUndefined(value)) @IsString() @Length(1, 120)
    promoCode?: string

    @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1)
    page = 1

    @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(10) @Max(100)
    pageSize = 25

    @ApiPropertyOptional({ enum: AdminUserSortBy, default: AdminUserSortBy.CREATED_AT }) @IsOptional() @IsEnum(AdminUserSortBy)
    sortBy: AdminUserSortBy = AdminUserSortBy.CREATED_AT

    @ApiPropertyOptional({ enum: AdminSortDirection, default: AdminSortDirection.DESC }) @IsOptional() @IsEnum(AdminSortDirection)
    sortDir: AdminSortDirection = AdminSortDirection.DESC
}

export class AdminUserDetailsQueryDto {
    @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1)
    paymentPage = 1

    @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(10) @Max(50)
    paymentPageSize = 25
}
