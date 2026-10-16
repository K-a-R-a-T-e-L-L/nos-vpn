import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Subscription } from './subscription.entity'
import { PaymentMethod } from '../../payment/entity/payment-method.entity'
import { Payment } from '../../payment/entity/payment.entity'
import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { SubscriptionRenewalStatus } from '../enum/subscription-renewal-status.enum'

@Entity('subscription_renewals')
@Index(
    'UQ_subscription_renewals_subscription_period',
    ['subscriptionId', 'billingPeriodKey'],
    { unique: true },
)
@Index('IDX_subscription_renewals_status_next_attempt', ['status', 'nextAttemptAt', 'id'])
@Index('IDX_subscription_renewals_payment_method', ['paymentMethodId', 'status'])
export class SubscriptionRenewal extends BaseEntity {
    @ManyToOne(() => Subscription, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription

    @Column({ name: 'subscription_id', type: 'uuid' })
    subscriptionId: string

    @ManyToOne(() => PaymentMethod, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'payment_method_id' })
    paymentMethod?: PaymentMethod | null

    @Column({
        name: 'payment_method_id',
        type: 'uuid',
        nullable: true,
    })
    paymentMethodId?: string | null

    @Column({
        name: 'merchant',
        type: 'enum',
        enum: PaymentMerchant,
        enumName: 'payment_merchant_enum',
    })
    merchant: PaymentMerchant

    @Column({
        name: 'period_start',
        type: 'timestamptz',
    })
    periodStart: Date

    @Column({
        name: 'period_end',
        type: 'timestamptz',
    })
    periodEnd: Date

    @Column({
        name: 'billing_period_key',
        type: 'varchar',
        length: 64,
    })
    billingPeriodKey: string

    @Column({
        name: 'status',
        type: 'enum',
        enum: SubscriptionRenewalStatus,
        enumName: 'subscription_renewal_status_enum',
        default: SubscriptionRenewalStatus.PLANNED,
    })
    status: SubscriptionRenewalStatus

    @Column({
        name: 'attempt_count',
        type: 'int',
        default: 0,
    })
    attemptCount: number

    @Column({
        name: 'next_attempt_at',
        type: 'timestamptz',
        nullable: true,
    })
    nextAttemptAt?: Date | null

    @ManyToOne(() => Payment, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'succeeded_payment_id' })
    succeededPayment?: Payment | null

    @Column({
        name: 'succeeded_payment_id',
        type: 'uuid',
        nullable: true,
    })
    succeededPaymentId?: string | null

    @Column({
        name: 'failure_code',
        type: 'varchar',
        nullable: true,
    })
    failureCode?: string | null

    @Column({
        name: 'failure_message',
        type: 'text',
        nullable: true,
    })
    failureMessage?: string | null
}
