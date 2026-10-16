import { ApiProperty } from '@nestjs/swagger'
import { Exclude } from 'class-transformer'
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { PaymentMethod } from '../../payment/entity/payment-method.entity'
import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { Plan } from '../../plan/entity/plan.entity'
import { User } from '../../system/user/entity/user.entity'
import { StatusesEnum } from '../enum/statuses.enum'
import { SubscriptionAutoRenewStatus } from '../enum/subscription-auto-renew-status.enum'

@Entity('subscriptions')
@Index('IDX_subscriptions_auto_renew_due', ['autoRenewEnabled', 'autoRenewStatus', 'nextPaymentAt', 'id'])
@Index('IDX_subscriptions_auto_renew_method', ['autoRenewPaymentMethodId', 'autoRenewEnabled'])
@Index('IDX_subscriptions_status_ends', ['status', 'endsAt'])
@Index('IDX_subscriptions_plan_status_ends', ['planId', 'status', 'endsAt'])
@Index('IDX_subscriptions_auto_renew_next_payment', ['autoRenewEnabled', 'nextPaymentAt'])
export class Subscription extends BaseEntity {
    @ApiProperty()
    @Column({ type: 'enum', enum: StatusesEnum, default: StatusesEnum.PENDING })
    status: StatusesEnum

    // Owning side: holds user_id
    @OneToOne(() => User, (user) => user.subscription, { onDelete: 'CASCADE', eager: true })
    @JoinColumn({ name: 'user_id' }) // references User.uuid by default
    user: User

    @Column({ name: 'user_id' })
    @ApiProperty()
    userId: string
    // // If you want quick access to the FK value, use RelationId (no duplicate column definition)
    // @RelationId((s: Subscription) => s.user)
    // readonly userId: string

    @ApiProperty()
    @ManyToOne(() => Plan, { eager: true })
    @JoinColumn({ name: 'plan_id' })
    plan: Plan

    @Column({ name: 'plan_id', type: 'uuid' })
    planId: string

    @Exclude()
    @Column({ name: 'yookassa_payment_id' })
    yookassaPaymentId: string

    @Column({ name: 'next_pay_at', type: 'timestamp' })
    @ApiProperty()
    nextPayAt: Date

    @Column({ name: 'start_at', type: 'timestamp' })
    @ApiProperty()
    startAt: Date

    @Column({ name: 'ends_at', type: 'timestamp', nullable: true })
    @ApiProperty({ required: false })
    endsAt?: Date

    @Column({ name: 'grace_ends_at', type: 'timestamp', nullable: true })
    @ApiProperty({ required: false })
    graceEndsAt?: Date

    @Column({ name: 'is_trial', default: false })
    @ApiProperty()
    isTrial: boolean

    @Column({ name: 'trial_ends_at', type: 'timestamp', nullable: true })
    @ApiProperty({ required: false })
    trialEndsAt?: Date

    @Column({ name: 'source_promo_code_id', type: 'uuid', nullable: true })
    @ApiProperty({ required: false })
    sourcePromoCodeId?: string

    @Column({ name: 'last_provisioned_at', type: 'timestamp', nullable: true })
    @ApiProperty({ required: false })
    lastProvisionedAt?: Date

    @Column({ name: 'access_disabled_at', type: 'timestamp', nullable: true })
    @ApiProperty({ required: false })
    accessDisabledAt?: Date

    @Column({ name: 'reminder_state', type: 'jsonb', nullable: true, default: () => "'{}'" })
    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    reminderState?: Record<string, string>

    @Column({ name: 'auto_renew_enabled', default: false })
    autoRenewEnabled: boolean

    @Column({ name: 'auto_renew_status', type: 'enum', enum: SubscriptionAutoRenewStatus, enumName: 'subscription_auto_renew_status_enum', default: SubscriptionAutoRenewStatus.DISABLED })
    autoRenewStatus: SubscriptionAutoRenewStatus

    @Column({ name: 'auto_renew_merchant', type: 'enum', enum: PaymentMerchant, enumName: 'payment_merchant_enum', nullable: true })
    autoRenewMerchant?: PaymentMerchant | null

    @ManyToOne(() => PaymentMethod, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'auto_renew_payment_method_id' })
    autoRenewPaymentMethod?: PaymentMethod | null

    @Column({ name: 'auto_renew_payment_method_id', type: 'uuid', nullable: true })
    autoRenewPaymentMethodId?: string | null

    @Column({ name: 'auto_renew_enabled_at', type: 'timestamptz', nullable: true })
    autoRenewEnabledAt?: Date | null

    @Column({ name: 'auto_renew_canceled_at', type: 'timestamptz', nullable: true })
    autoRenewCanceledAt?: Date | null

    @Column({ name: 'next_payment_at', type: 'timestamptz', nullable: true })
    nextPaymentAt?: Date | null

    @Column({ name: 'last_payment_at', type: 'timestamptz', nullable: true })
    lastPaymentAt?: Date | null

    @Column({ name: 'auto_renew_failure_count', type: 'int', default: 0 })
    autoRenewFailureCount: number
}
