import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { PaymentMethod } from './payment-method.entity'
import { Plan } from '../../plan/entity/plan.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { User } from '../../system/user/entity/user.entity'
import { PaymentActivationStatus } from '../enum/payment-activation-status.enum'
import { PaymentKind } from '../enum/payment-kind.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'

@Entity('payments')
@Index(['provider', 'providerPaymentId'])
@Index(['idempotencyKey'], { unique: true })
@Index('IDX_payments_activation_retry', ['activationStatus', 'activationLeaseExpiresAt', 'id'])
@Index('IDX_payments_payment_method', ['paymentMethodId', 'status'])
@Index('IDX_payments_parent', ['parentPaymentId'])
@Index('IDX_payments_status_paid_id', ['status', 'paidAt', 'id'])
@Index('IDX_payments_status_merchant_provider_paid', ['status', 'merchant', 'provider', 'paidAt'])
@Index('IDX_payments_user_status_paid', ['userId', 'status', 'paidAt'])
@Index('IDX_payments_plan_status_paid', ['planId', 'status', 'paidAt'])
@Index('IDX_payments_created_status', ['createdAt', 'status'])
@Index('UQ_payments_yookassa_provider_payment', ['provider', 'merchant', 'providerPaymentId'], {
    unique: true,
    where: `"provider" = 'yookassa' AND "merchant" IS NOT NULL AND "provider_payment_id" IS NOT NULL AND "deleted_at" IS NULL`,
})
@Index('UQ_payments_platega_recurrent_charge', ['provider', 'merchant', 'providerPaymentId'], {
    unique: true,
    where: `"provider" = 'platega' AND "is_recurring" = true AND "merchant" IS NOT NULL AND "provider_payment_id" IS NOT NULL AND "deleted_at" IS NULL`,
})
export class Payment extends BaseEntity {
    @ApiProperty()
    @Column()
    amount: number

    @ApiProperty()
    @Column({ default: 'RUB' })
    currency: string

    @ApiProperty()
    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User

    @ApiProperty()
    @Column({ name: 'user_id', type: 'uuid', nullable: true })
    userId?: string

    @ApiProperty()
    @Column({ default: PaymentStatusEnum.PENDING })
    status: PaymentStatusEnum

    @ApiProperty()
    @Column({ default: 'platega' })
    provider: string

    @Column({
        name: 'kind',
        type: 'enum',
        enum: PaymentKind,
        enumName: 'payment_kind_enum',
        nullable: true,
    })
    kind?: PaymentKind | null

    @Column({
        name: 'merchant',
        type: 'enum',
        enum: PaymentMerchant,
        enumName: 'payment_merchant_enum',
        nullable: true,
    })
    merchant?: PaymentMerchant | null

    @ApiProperty()
    @Column({ name: 'payment_pay_id', nullable: true })
    paymentPayId?: string

    @ApiProperty()
    @Column({ name: 'payment_link', nullable: true })
    paymentLink?: string

    @ApiProperty()
    @ManyToOne(() => Subscription)
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription

    @ApiProperty()
    @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
    subscriptionId?: string

    @ApiProperty({ required: false })
    @ManyToOne(() => Plan)
    @JoinColumn({ name: 'plan_id' })
    plan?: Plan

    @ApiProperty({ required: false })
    @Column({ name: 'plan_id', type: 'uuid', nullable: true })
    planId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'provider_payment_id', nullable: true })
    providerPaymentId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'provider_invoice_id', nullable: true })
    providerInvoiceId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'payment_url', type: 'text', nullable: true })
    paymentUrl?: string

    @ApiProperty({ required: false })
    @Column({ name: 'return_url', type: 'text', nullable: true })
    returnUrl?: string

    @ApiProperty({ required: false })
    @Column({ name: 'idempotency_key', nullable: true })
    idempotencyKey?: string

    @ApiProperty({ required: false })
    @Column({ name: 'external_event_id', nullable: true, unique: true })
    externalEventId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'external_status', nullable: true })
    externalStatus?: string

    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    @Column({ name: 'metadata_snapshot', type: 'jsonb', nullable: true })
    metadataSnapshot?: Record<string, any>

    @ApiProperty({ required: false })
    @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
    paidAt?: Date

    @ApiProperty({ required: false })
    @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
    failedAt?: Date

    @ApiProperty({ required: false })
    @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
    canceledAt?: Date

    @ApiProperty({ required: false })
    @Column({ name: 'expired_at', type: 'timestamptz', nullable: true })
    expiredAt?: Date

    @Column({
        name: 'activation_status',
        type: 'enum',
        enum: PaymentActivationStatus,
        enumName: 'payment_activation_status_enum',
        nullable: true,
    })
    activationStatus?: PaymentActivationStatus | null

    @Column({ name: 'activation_lease_token', type: 'uuid', nullable: true })
    activationLeaseToken?: string | null

    @Column({ name: 'activation_lease_expires_at', type: 'timestamptz', nullable: true })
    activationLeaseExpiresAt?: Date | null

    @Column({ name: 'activation_attempt_count', type: 'int', default: 0 })
    activationAttemptCount: number

    @Column({ name: 'activation_error_code', nullable: true })
    activationErrorCode?: string | null

    @Column({ name: 'activation_error_message', type: 'text', nullable: true })
    activationErrorMessage?: string | null

    @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
    processedAt?: Date | null

    @ManyToOne(() => PaymentMethod, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'payment_method_id' })
    paymentMethod?: PaymentMethod | null

    @Column({ name: 'payment_method_id', type: 'uuid', nullable: true })
    paymentMethodId?: string | null

    @Column({ name: 'is_recurring', default: false })
    isRecurring: boolean

    @ManyToOne(() => Payment, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'parent_payment_id' })
    parentPayment?: Payment | null

    @Column({ name: 'parent_payment_id', type: 'uuid', nullable: true })
    parentPaymentId?: string | null

    @Column({ name: 'billing_period_key', length: 64, nullable: true })
    billingPeriodKey?: string | null
}
