import { ApiProperty } from '@nestjs/swagger'

import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { SubscriptionAutoRenewStatus } from '../enum/subscription-auto-renew-status.enum'

export class AutoRenewResponseDto {
    @ApiProperty() enabled: boolean
    @ApiProperty({ enum: SubscriptionAutoRenewStatus }) status: SubscriptionAutoRenewStatus
    @ApiProperty({ enum: PaymentMerchant, nullable: true }) merchant: PaymentMerchant | null
    @ApiProperty({ nullable: true }) nextPaymentAt: Date | null
    @ApiProperty({ nullable: true }) lastPaymentAt: Date | null
    @ApiProperty({ nullable: true })
    method: { type: string | null; title: string | null; last4: string | null } | null
}
