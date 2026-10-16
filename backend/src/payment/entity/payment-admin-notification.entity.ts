import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Payment } from './payment.entity'
import { PaymentAdminNotificationStatus } from '../enum/payment-admin-notification-status.enum'

@Entity('payment_admin_notifications')
@Index('UQ_payment_admin_notifications_payment', ['paymentId'], { unique: true })
@Index('IDX_payment_admin_notifications_due', ['status', 'nextAttemptAt'])
@Index('IDX_payment_admin_notifications_lease', ['leaseExpiresAt'])
export class PaymentAdminNotification extends BaseEntity {
    @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'payment_id' })
    payment: Payment

    @Column({ name: 'payment_id', type: 'uuid' })
    paymentId: string

    @Column({
        type: 'enum',
        enum: PaymentAdminNotificationStatus,
        enumName: 'payment_admin_notification_status_enum',
        default: PaymentAdminNotificationStatus.PENDING,
    })
    status: PaymentAdminNotificationStatus

    @Column({ type: 'int', default: 0 })
    attempts: number

    @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
    nextAttemptAt: Date | null

    @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
    sentAt: Date | null

    @Column({ name: 'lease_token', type: 'uuid', nullable: true })
    leaseToken: string | null

    @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
    leaseExpiresAt: Date | null

    @Column({ name: 'last_error_code', length: 64, nullable: true })
    lastErrorCode: string | null
}
