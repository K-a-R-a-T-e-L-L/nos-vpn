import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { AdminAnalyticsPeriodPreset } from '../../enum/admin-analytics-period-preset.enum'
import { AdminPaymentType } from '../../enum/admin-payment-type.enum'

export class AdminAnalyticsPeriodResponseDto {
    @ApiProperty() from: string
    @ApiProperty() to: string
    @ApiProperty({ example: 'Europe/Moscow' }) timezone: string
    @ApiProperty({ enum: AdminAnalyticsPeriodPreset }) preset: AdminAnalyticsPeriodPreset
}

export class AdminMoneyOverviewResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty() grossRevenue: string
    @ApiProperty() successfulPayments: number
    @ApiProperty() uniquePayingUsers: number
    @ApiProperty() averageCheck: string
    @ApiProperty() firstPurchases: number
    @ApiProperty() manualRenewals: number
    @ApiProperty() recurrentPayments: number
    @ApiProperty() failedPayments: number
    @ApiProperty() canceledPayments: number
    @ApiProperty() expiredPayments: number
}

export class AdminMoneyTimeseriesPointDto {
    @ApiProperty() date: string
    @ApiProperty() grossRevenue: string
    @ApiProperty() successfulPayments: number
    @ApiProperty() firstPurchases: number
    @ApiProperty() manualRenewals: number
    @ApiProperty() recurrentPayments: number
    @ApiProperty() failedPayments: number
    @ApiProperty() canceledPayments: number
}

export class AdminMoneyTimeseriesResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty({ type: [AdminMoneyTimeseriesPointDto] }) items: AdminMoneyTimeseriesPointDto[]
}

export class AdminBreakdownItemDto {
    @ApiProperty() key: string
    @ApiProperty() label: string
    @ApiProperty() successfulPayments: number
    @ApiProperty() grossRevenue: string
}

export class AdminPromoUsageBreakdownItemDto {
    @ApiProperty() key: string
    @ApiProperty() label: string
    @ApiProperty() usageCount: number
}

export class AdminMoneyBreakdownsResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty({ type: [AdminBreakdownItemDto] }) byMerchant: AdminBreakdownItemDto[]
    @ApiProperty({ type: [AdminBreakdownItemDto] }) byProvider: AdminBreakdownItemDto[]
    @ApiProperty({ type: [AdminBreakdownItemDto] }) byPaymentType: AdminBreakdownItemDto[]
    @ApiProperty({ type: [AdminBreakdownItemDto] }) byPlan: AdminBreakdownItemDto[]
    @ApiProperty({ type: [AdminBreakdownItemDto] }) byStatus: AdminBreakdownItemDto[]
    @ApiProperty({ type: [AdminPromoUsageBreakdownItemDto] }) promoUsage: AdminPromoUsageBreakdownItemDto[]
}

export class AdminSafeUserDto {
    @ApiPropertyOptional() id?: string | null
    @ApiProperty() label: string
    @ApiPropertyOptional() email?: string | null
    @ApiPropertyOptional() telegramUsername?: string | null
}

export class AdminSafePlanDto {
    @ApiPropertyOptional() id?: string | null
    @ApiPropertyOptional() code?: string | null
    @ApiPropertyOptional() title?: string | null
}

export class AdminPaymentItemDto {
    @ApiProperty() id: string
    @ApiProperty() shortId: string
    @ApiProperty() createdAt: string
    @ApiPropertyOptional() paidAt?: string | null
    @ApiProperty({ type: AdminSafeUserDto }) user: AdminSafeUserDto
    @ApiPropertyOptional() merchant?: string | null
    @ApiProperty() provider: string
    @ApiProperty({ enum: AdminPaymentType }) paymentType: AdminPaymentType
    @ApiProperty({ type: AdminSafePlanDto }) plan: AdminSafePlanDto
    @ApiPropertyOptional() promoCode?: string | null
    @ApiProperty() amount: string
    @ApiProperty() currency: string
    @ApiProperty() status: string
    @ApiPropertyOptional() activationStatus?: string | null
}

export class AdminPaymentListResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty({ type: [AdminPaymentItemDto] }) items: AdminPaymentItemDto[]
    @ApiProperty() total: number
    @ApiProperty() page: number
    @ApiProperty() pageSize: number
    @ApiProperty() totalPages: number
}

export class AdminReferralOverviewResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty() referredRegistrations: number
    @ApiProperty() referredPayingUsers: number
    @ApiProperty() successfulPayments: number
    @ApiProperty() conversionPercent: string
    @ApiProperty() referredGrossRevenue: string
    @ApiProperty() awardedBonusTotal: string
    @ApiProperty() pendingBonusCount: number
    @ApiProperty() rejectedBonusCount: number
}

export class AdminReferralItemDto {
    @ApiProperty({ type: AdminSafeUserDto }) referrer: AdminSafeUserDto
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

export class AdminReferralListResponseDto {
    @ApiProperty({ type: AdminAnalyticsPeriodResponseDto }) period: AdminAnalyticsPeriodResponseDto
    @ApiProperty({ type: [AdminReferralItemDto] }) items: AdminReferralItemDto[]
    @ApiProperty() total: number
    @ApiProperty() page: number
    @ApiProperty() pageSize: number
    @ApiProperty() totalPages: number
}
