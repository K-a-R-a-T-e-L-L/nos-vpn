import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { User } from '../../system/user/entity/user.entity'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentMethodStatus } from '../enum/payment-method-status.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'

@Entity('payment_methods')
@Index(
    'UQ_payment_methods_provider_merchant_method',
    ['provider', 'merchant', 'providerMethodId'],
    { unique: true },
)
@Index('IDX_payment_methods_user_status', ['userId', 'status'])
export class PaymentMethod extends BaseEntity {
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string

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
        name: 'provider_method_id',
        type: 'varchar',
        select: false,
    })
    providerMethodId: string

    @Column({
        name: 'status',
        type: 'enum',
        enum: PaymentMethodStatus,
        enumName: 'payment_method_status_enum',
        default: PaymentMethodStatus.ACTIVE,
    })
    status: PaymentMethodStatus

    @Column({
        name: 'revoked_at',
        type: 'timestamptz',
        nullable: true,
    })
    revokedAt?: Date | null

    @Column({
        name: 'last_used_at',
        type: 'timestamptz',
        nullable: true,
    })
    lastUsedAt?: Date | null

    @Column({ name: 'method_type', nullable: true })
    methodType?: string | null

    @Column({ name: 'display_title', nullable: true })
    displayTitle?: string | null

    @Column({ name: 'last4', length: 4, nullable: true })
    last4?: string | null
}
