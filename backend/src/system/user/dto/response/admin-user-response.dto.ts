import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { AdminPaymentItemDto, AdminSafeUserDto } from '../../../../analytics/dto/response/admin-analytics-response.dto'

export class AdminUserSubscriptionDto {
    @ApiProperty() state: string
    @ApiPropertyOptional() status?: string | null
    @ApiPropertyOptional() planId?: string | null
    @ApiPropertyOptional() planTitle?: string | null
    @ApiPropertyOptional() endsAt?: string | null
    @ApiProperty() autoRenewEnabled: boolean
}

export class AdminUserItemDto {
    @ApiProperty() id: string
    @ApiProperty() label: string
    @ApiPropertyOptional() email?: string | null
    @ApiPropertyOptional() telegramUsername?: string | null
    @ApiProperty({ type: [String], enum: ['EMAIL', 'TELEGRAM'] }) authChannels: string[]
    @ApiProperty() createdAt: string
    @ApiProperty() role: string
    @ApiProperty() isBlocked: boolean
    @ApiProperty({ type: AdminUserSubscriptionDto }) subscription: AdminUserSubscriptionDto
    @ApiProperty() successfulPaidTotal: string
    @ApiProperty() successfulPayments: number
    @ApiPropertyOptional() lastPaidAt?: string | null
    @ApiProperty() referredUsersCount: number
    @ApiProperty() wasReferred: boolean
}

export class AdminUserListResponseDto {
    @ApiProperty({ type: [AdminUserItemDto] }) items: AdminUserItemDto[]
    @ApiProperty() total: number
    @ApiProperty() page: number
    @ApiProperty() pageSize: number
    @ApiProperty() totalPages: number
}

export class AdminUserPromoUsageDto {
    @ApiProperty() promoCode: string
    @ApiProperty() status: string
    @ApiPropertyOptional() appliedAt?: string | null
}

export class AdminUserReferralSummaryDto {
    @ApiPropertyOptional({ type: AdminSafeUserDto }) referrer?: AdminSafeUserDto | null
    @ApiProperty() referredUsersCount: number
    @ApiProperty() referredPayingUsers: number
    @ApiProperty() awardedBonusTotal: string
    @ApiProperty() currentWalletBalance: string
}

export class AdminUserSupportSummaryDto {
    @ApiPropertyOptional() status?: string | null
    @ApiProperty() messagesCount: number
    @ApiPropertyOptional() lastMessageAt?: string | null
    @ApiPropertyOptional() lastUserMessageAt?: string | null
    @ApiPropertyOptional() lastAdminMessageAt?: string | null
}

export class AdminUserDetailsResponseDto {
    @ApiProperty({ type: AdminUserItemDto }) profile: AdminUserItemDto
    @ApiProperty({ type: [AdminPaymentItemDto] }) paymentHistory: AdminPaymentItemDto[]
    @ApiProperty() paymentTotal: number
    @ApiProperty() paymentPage: number
    @ApiProperty() paymentPageSize: number
    @ApiProperty({ type: [AdminUserPromoUsageDto] }) promoUsages: AdminUserPromoUsageDto[]
    @ApiProperty({ type: AdminUserReferralSummaryDto }) referral: AdminUserReferralSummaryDto
    @ApiProperty({ type: AdminUserSupportSummaryDto }) supportSummary: AdminUserSupportSummaryDto
}

export class AdminUserAccessResponseDto {
    @ApiPropertyOptional({ nullable: true }) status?: string | null
    @ApiProperty() deliveryMode: string
    @ApiPropertyOptional({ nullable: true }) subscriptionUrl?: string | null
    @ApiPropertyOptional({ nullable: true }) expiresAt?: Date | null
    @ApiPropertyOptional({ nullable: true }) planTitle?: string | null
}
