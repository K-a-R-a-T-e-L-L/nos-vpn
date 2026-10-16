import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

const decimalNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | number | null) => (value === null || value === undefined ? value : Number(value)),
}

export enum ReferralRewardStatusEnum {
    PENDING_WINDOW = 'PENDING_WINDOW',
    CALCULATION_PENDING = 'CALCULATION_PENDING',
    AWARDED = 'AWARDED',
    REJECTED = 'REJECTED',
}

@Entity('referral_bonus_ledger')
@Index('IDX_referral_bonus_referred_user', ['referredUserId'])
@Index('IDX_referral_bonus_referrer_status_awarded', ['referrerUserId', 'status', 'awardedAt'])
@Index('IDX_referral_bonus_referred_status', ['referredUserId', 'status'])
@Index('UQ_referral_bonus_payment', ['paymentId'], { unique: true, where: '"payment_id" IS NOT NULL' })
export class ReferralBonusLedger extends BaseEntity {
    @ApiProperty()
    @Column({ name: 'referrer_user_id', type: 'uuid' })
    referrerUserId: string

    @ApiProperty()
    @Column({ name: 'referred_user_id', type: 'uuid' })
    referredUserId: string

    @ApiProperty({ required: false })
    @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
    subscriptionId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'payment_id', type: 'uuid', nullable: true })
    paymentId?: string

    @ApiProperty()
    @Column({
        name: 'bonus_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        default: 0,
        transformer: decimalNumberTransformer,
    })
    bonusRub: number

    @ApiProperty()
    @Column({ name: 'bonus_percent', type: 'int', default: 50 })
    bonusPercent: number

    @ApiProperty({ required: false, nullable: true })
    @Column({
        name: 'gross_amount_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        nullable: true,
        transformer: decimalNumberTransformer,
    })
    grossAmountRub?: number | null

    @ApiProperty({ required: false, nullable: true })
    @Column({
        name: 'tax_amount_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        nullable: true,
        transformer: decimalNumberTransformer,
    })
    taxAmountRub?: number | null

    @ApiProperty({ required: false, nullable: true })
    @Column({
        name: 'provider_income_amount_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        nullable: true,
        transformer: decimalNumberTransformer,
    })
    providerIncomeAmountRub?: number | null

    @ApiProperty({ required: false, nullable: true })
    @Column({
        name: 'provider_fee_amount_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        nullable: true,
        transformer: decimalNumberTransformer,
    })
    providerFeeAmountRub?: number | null

    @ApiProperty({ required: false, nullable: true })
    @Column({
        name: 'net_referral_base_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        nullable: true,
        transformer: decimalNumberTransformer,
    })
    netReferralBaseRub?: number | null

    @ApiProperty({ required: false, nullable: true })
    @Column({ name: 'payment_method_type', length: 64, nullable: true })
    paymentMethodType?: string | null

    @ApiProperty({ required: false, nullable: true })
    @Column({ name: 'calculation_version', length: 32, nullable: true })
    calculationVersion?: string | null

    @ApiProperty({ required: false, nullable: true })
    @Column({ name: 'calculation_error_code', length: 64, nullable: true })
    calculationErrorCode?: string | null

    @ApiProperty({ enum: ReferralRewardStatusEnum })
    @Column({ type: 'enum', enum: ReferralRewardStatusEnum, default: ReferralRewardStatusEnum.PENDING_WINDOW })
    status: ReferralRewardStatusEnum

    @ApiProperty()
    @Column({ name: 'eligible_at', type: 'timestamptz' })
    eligibleAt: Date

    @ApiProperty({ required: false })
    @Column({ name: 'awarded_at', type: 'timestamptz', nullable: true })
    awardedAt?: Date
}
