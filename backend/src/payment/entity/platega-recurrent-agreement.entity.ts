import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Plan } from '../../plan/entity/plan.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { User } from '../../system/user/entity/user.entity'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PlategaRecurrentAgreementStatus } from '../enum/platega-recurrent-agreement-status.enum'

@Entity('platega_recurrent_agreements')
@Index('UQ_platega_recurrent_provider_subscription', ['provider', 'merchant', 'providerSubscriptionId'], {
    unique: true,
    where: '"provider_subscription_id" IS NOT NULL AND "deleted_at" IS NULL',
})
@Index('UQ_platega_recurrent_create_operation', ['provider', 'merchant', 'userId', 'createIdempotencyKey'], {
    unique: true,
    where: '"create_idempotency_key" IS NOT NULL AND "deleted_at" IS NULL',
})
@Index('IDX_platega_recurrent_subscription_status', ['subscriptionId', 'normalizedStatus'])
export class PlategaRecurrentAgreement extends BaseEntity {
    @Column({
        type: 'enum',
        enum: PaymentProvider,
        enumName: 'payment_provider_enum',
        default: PaymentProvider.PLATEGA,
    })
    provider: PaymentProvider

    @Column({ type: 'enum', enum: PaymentMerchant, enumName: 'payment_merchant_enum' })
    merchant: PaymentMerchant

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string

    @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription

    @Column({ name: 'subscription_id', type: 'uuid' })
    subscriptionId: string

    @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'plan_id' })
    plan: Plan

    @Column({ name: 'plan_id', type: 'uuid' })
    planId: string

    @Column({ name: 'plan_snapshot', type: 'jsonb' })
    planSnapshot: Record<string, any>

    @Column({ name: 'provider_subscription_id', nullable: true })
    providerSubscriptionId?: string | null

    @Column({ name: 'create_idempotency_key', length: 128 })
    createIdempotencyKey: string

    @Column({ name: 'raw_provider_status', nullable: true })
    rawProviderStatus?: string | null

    @Column({
        name: 'normalized_status',
        type: 'enum',
        enum: PlategaRecurrentAgreementStatus,
        enumName: 'platega_recurrent_agreement_status_enum',
        default: PlategaRecurrentAgreementStatus.CREATING,
    })
    normalizedStatus: PlategaRecurrentAgreementStatus

    @Column({ type: 'int' })
    amount: number

    @Column({ length: 3, default: 'RUB' })
    currency: string

    @Column({ name: 'provider_interval', type: 'int' })
    providerInterval: number

    @Column({ name: 'interval_count', type: 'int' })
    intervalCount: number

    @Column({ name: 'duration_days', type: 'int' })
    durationDays: number

    @Column({ name: 'consent_accepted_at', type: 'timestamptz', nullable: true })
    consentAcceptedAt?: Date | null

    @Column({ name: 'consent_legal_version', length: 16, nullable: true })
    consentLegalVersion?: string | null

    @Column({ name: 'redirect_url', type: 'text', nullable: true })
    redirectUrl?: string | null

    @Column({ name: 'next_charge_at', type: 'timestamptz', nullable: true })
    nextChargeAt?: Date | null

    @Column({ name: 'last_charge_at', type: 'timestamptz', nullable: true })
    lastChargeAt?: Date | null

    @Column({ name: 'cancel_requested_at', type: 'timestamptz', nullable: true })
    cancelRequestedAt?: Date | null

    @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
    cancelledAt?: Date | null

    @Column({ name: 'provider_cancelled_at', type: 'timestamptz', nullable: true })
    providerCancelledAt?: Date | null
}
