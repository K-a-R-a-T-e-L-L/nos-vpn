import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Payment } from './payment.entity'
import { SubscriptionRenewal } from '../../subscription/entity/subscription-renewal.entity'
import { PaymentAttemptStatus } from '../enum/payment-attempt-status.enum'
import { PaymentAttemptType } from '../enum/payment-attempt-type.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'

@Entity('payment_attempts')
@Index('UQ_payment_attempts_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('UQ_payment_attempts_payment_number', ['paymentId', 'attemptNumber'], { unique: true })
@Index('IDX_payment_attempts_provider_payment', ['provider', 'merchant', 'providerPaymentId'])
@Index('IDX_payment_attempts_status_retry', ['status', 'nextRetryAt', 'id'])
@Index('IDX_payment_attempts_renewal', ['renewalId', 'attemptNumber'])
export class PaymentAttempt extends BaseEntity {
    @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'payment_id' })
    payment: Payment

    @Column({ name: 'payment_id', type: 'uuid' })
    paymentId: string

    @ManyToOne(() => SubscriptionRenewal, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'renewal_id' })
    renewal?: SubscriptionRenewal | null

    @Column({
        name: 'renewal_id',
        type: 'uuid',
        nullable: true,
    })
    renewalId?: string | null

    @Column({
        name: 'attempt_type',
        type: 'enum',
        enum: PaymentAttemptType,
        enumName: 'payment_attempt_type_enum',
        default: PaymentAttemptType.INITIAL,
    })
    attemptType: PaymentAttemptType

    @Column({
        name: 'attempt_number',
        type: 'int',
        default: 1,
    })
    attemptNumber: number

    @Column({
        name: 'provider',
        type: 'enum',
        enum: PaymentProvider,
        enumName: 'payment_provider_enum',
    })
    provider: PaymentProvider

    @Column({
        name: 'merchant',
        type: 'enum',
        enum: PaymentMerchant,
        enumName: 'payment_merchant_enum',
    })
    merchant: PaymentMerchant

    @Column({
        name: 'idempotency_key',
        type: 'varchar',
    })
    idempotencyKey: string

    @Column({
        name: 'provider_payment_id',
        type: 'varchar',
        nullable: true,
    })
    providerPaymentId?: string | null

    @Column({
        name: 'status',
        type: 'enum',
        enum: PaymentAttemptStatus,
        enumName: 'payment_attempt_status_enum',
        default: PaymentAttemptStatus.CREATED,
    })
    status: PaymentAttemptStatus

    @Column({
        name: 'retryable',
        type: 'boolean',
        default: false,
    })
    retryable: boolean

    @Column({
        name: 'error_code',
        type: 'varchar',
        nullable: true,
    })
    errorCode?: string | null

    @Column({
        name: 'error_message',
        type: 'text',
        nullable: true,
    })
    errorMessage?: string | null

    @Column({
        name: 'next_retry_at',
        type: 'timestamptz',
        nullable: true,
    })
    nextRetryAt?: Date | null

    @Column({
        name: 'started_at',
        type: 'timestamptz',
        nullable: true,
    })
    startedAt?: Date | null

    @Column({
        name: 'finished_at',
        type: 'timestamptz',
        nullable: true,
    })
    finishedAt?: Date | null

    @Column({
        name: 'request_snapshot',
        type: 'jsonb',
        nullable: true,
    })
    requestSnapshot?: Record<string, unknown> | null

    @Column({
        name: 'response_snapshot',
        type: 'jsonb',
        nullable: true,
    })
    responseSnapshot?: Record<string, unknown> | null
}
