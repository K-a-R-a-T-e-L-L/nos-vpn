import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { AdminAnalyticsPeriodResponseDto, AdminSafePlanDto, AdminSafeUserDto } from './admin-analytics-response.dto'

export class AdminReferrerPeriodMetricsDto {
    @ApiProperty() invitedUsers: number
    @ApiProperty() payingInvitedUsers: number
    @ApiProperty() referredSuccessfulPayments: number
    @ApiProperty() referredGrossRevenue: string
    @ApiProperty() awardedBonus: string
}

export class AdminReferrerItemDto {
    @ApiProperty({ type: AdminSafeUserDto }) referrer: AdminSafeUserDto
    @ApiProperty() invitedUsers: number
    @ApiProperty() payingInvitedUsers: number
    @ApiProperty() referralConversionPercent: string
    @ApiProperty() referredSuccessfulPayments: number
    @ApiProperty() referredGrossRevenue: string
    @ApiProperty() lifetimeAwardedBonus: string
    @ApiProperty() currentWalletBalance: string
    @ApiPropertyOptional() firstReferralAt?: string | null
    @ApiPropertyOptional() lastReferralAt?: string | null
    @ApiPropertyOptional() lastAwardedAt?: string | null
    @ApiProperty({ type: AdminReferrerPeriodMetricsDto }) periodMetrics: AdminReferrerPeriodMetricsDto
}

export class AdminReferrerListResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty({ type: [AdminReferrerItemDto] }) items: AdminReferrerItemDto[]
    @ApiProperty() total: number
    @ApiProperty() page: number
    @ApiProperty() pageSize: number
    @ApiProperty() totalPages: number
}

export class AdminReferrerInviteItemDto {
    @ApiProperty({ type: AdminSafeUserDto }) invitedUser: AdminSafeUserDto
    @ApiProperty() registeredAt: string
    @ApiPropertyOptional() firstPaidAt?: string | null
    @ApiProperty() successfulPayments: number
    @ApiProperty() successfulRevenue: string
    @ApiProperty() awardedBonus: string
    @ApiPropertyOptional() latestLedgerStatus?: string | null
    @ApiPropertyOptional() latestMerchant?: string | null
    @ApiProperty({ type: AdminSafePlanDto }) latestPlan: AdminSafePlanDto
    @ApiPropertyOptional() latestPromoCode?: string | null
}

export class AdminReferrerEarningsDto {
    @ApiProperty() currentMonth: string
    @ApiProperty() previousMonth: string
    @ApiProperty() allTime: string
    @ApiProperty({ example: 'Europe/Moscow' }) timezone: string
    @ApiProperty() currentMonthFrom: string
    @ApiProperty() currentMonthTo: string
    @ApiProperty() previousMonthFrom: string
}

export class AdminReferrerInvitesResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty({ type: AdminSafeUserDto }) referrer: AdminSafeUserDto
    @ApiProperty() lifetimeAwardedBonus: string
    @ApiProperty() currentWalletBalance: string
    @ApiProperty({ type: AdminReferrerEarningsDto }) earnings: AdminReferrerEarningsDto
    @ApiProperty({ type: [AdminReferrerInviteItemDto] }) items: AdminReferrerInviteItemDto[]
    @ApiProperty() total: number
    @ApiProperty() page: number
    @ApiProperty() pageSize: number
    @ApiProperty() totalPages: number
}
