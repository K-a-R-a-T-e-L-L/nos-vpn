import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'

import { AdminAnalyticsFilterDto } from './admin-analytics-filter.dto'
import { AdminSortDirection, arrayValue } from './admin-query.helpers'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'
import { AdminPaymentType } from '../enum/admin-payment-type.enum'

export enum AdminPaymentTypeFilter {
    ALL = 'ALL',
    FIRST_PURCHASE = 'FIRST_PURCHASE',
    MANUAL_RENEWAL = 'MANUAL_RENEWAL',
    RECURRENT = 'RECURRENT',
    BONUS = 'BONUS',
    PROMO_DISCOUNT = 'PROMO_DISCOUNT',
}

export enum AdminPaymentSortBy {
    PAID_AT = 'paidAt',
    CREATED_AT = 'createdAt',
    AMOUNT = 'amount',
    STATUS = 'status',
}

export class AdminPaymentQueryDto extends AdminAnalyticsFilterDto {
    @ApiPropertyOptional({ enum: PaymentStatusEnum, isArray: true })
    @IsOptional()
    @Transform(({ value }) => arrayValue(value))
    @IsArray()
    @IsEnum(PaymentStatusEnum, { each: true })
    statuses?: PaymentStatusEnum[]

    @ApiPropertyOptional({ enum: AdminPaymentTypeFilter, default: AdminPaymentTypeFilter.ALL })
    @IsOptional()
    @IsEnum(AdminPaymentTypeFilter)
    paymentType: AdminPaymentTypeFilter | AdminPaymentType = AdminPaymentTypeFilter.ALL

    @ApiPropertyOptional({ default: 1, minimum: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1

    @ApiPropertyOptional({ default: 25, minimum: 10, maximum: 100 })
    @Type(() => Number)
    @IsInt()
    @Min(10)
    @Max(100)
    pageSize = 25

    @ApiPropertyOptional({ enum: AdminPaymentSortBy, default: AdminPaymentSortBy.PAID_AT })
    @IsOptional()
    @IsEnum(AdminPaymentSortBy)
    sortBy: AdminPaymentSortBy = AdminPaymentSortBy.PAID_AT

    @ApiPropertyOptional({ enum: AdminSortDirection, default: AdminSortDirection.DESC })
    @IsOptional()
    @IsEnum(AdminSortDirection)
    sortDir: AdminSortDirection = AdminSortDirection.DESC
}
