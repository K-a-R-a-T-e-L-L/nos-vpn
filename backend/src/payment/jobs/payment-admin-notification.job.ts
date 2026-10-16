import { randomUUID } from 'crypto'

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

import { PaymentAdminNotification } from '../entity/payment-admin-notification.entity'
import { PaymentAdminNotificationStatus } from '../enum/payment-admin-notification-status.enum'
import { PaymentAdminNotificationService } from '../services/payment-admin-notification.service'
import { PaymentAdminNotificationError } from '../types/payment-admin-notification.error'

@Injectable()
export class PaymentAdminNotificationJob {
    private readonly logger = new Logger(PaymentAdminNotificationJob.name)

    constructor(
        private readonly dataSource: DataSource,
        private readonly config: ConfigService,
        @InjectRepository(PaymentAdminNotification)
        private readonly notifications: Repository<PaymentAdminNotification>,
        private readonly sender: PaymentAdminNotificationService,
    ) {}

    @Cron('*/1 * * * *')
    async run(): Promise<void> {
        if (this.config.get<string>('PAYMENT_ADMIN_NOTIFICATION_ENABLED') !== 'true') return
        const claim = await this.claimOne()
        if (!claim) return

        try {
            await this.sender.send(claim.paymentId)
            await this.notifications.update(
                {
                    id: claim.id,
                    status: PaymentAdminNotificationStatus.SENDING,
                    leaseToken: claim.leaseToken,
                },
                {
                    status: PaymentAdminNotificationStatus.SENT,
                    sentAt: new Date(),
                    nextAttemptAt: null,
                    leaseToken: null,
                    leaseExpiresAt: null,
                    lastErrorCode: null,
                },
            )
        } catch (error) {
            const safeError =
                error instanceof PaymentAdminNotificationError
                    ? error
                    : new PaymentAdminNotificationError('TELEGRAM_UNKNOWN_ERROR', false)
            const terminal = safeError.terminal || claim.attempts >= 5
            await this.notifications.update(
                {
                    id: claim.id,
                    status: PaymentAdminNotificationStatus.SENDING,
                    leaseToken: claim.leaseToken,
                },
                {
                    status: terminal
                        ? PaymentAdminNotificationStatus.TERMINAL
                        : PaymentAdminNotificationStatus.RETRYABLE,
                    nextAttemptAt: terminal ? null : new Date(Date.now() + this.retryDelayMs(claim.attempts)),
                    leaseToken: null,
                    leaseExpiresAt: null,
                    lastErrorCode: safeError.code,
                },
            )
            this.logger.warn(`Payment admin notification ${claim.id} failed with ${safeError.code}`)
        }
    }

    private async claimOne(): Promise<PaymentAdminNotification | null> {
        return this.dataSource.transaction(async (manager) => {
            const now = new Date()
            const notification = await manager
                .getRepository(PaymentAdminNotification)
                .createQueryBuilder('notification')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .where(
                    '((notification.status IN (:...dueStatuses) AND notification.nextAttemptAt <= :now) OR ' +
                        '(notification.status = :sendingStatus AND notification.leaseExpiresAt < :now))',
                )
                .setParameters({
                    dueStatuses: [PaymentAdminNotificationStatus.PENDING, PaymentAdminNotificationStatus.RETRYABLE],
                    sendingStatus: PaymentAdminNotificationStatus.SENDING,
                    now,
                })
                .orderBy('notification.nextAttemptAt', 'ASC', 'NULLS FIRST')
                .addOrderBy('notification.createdAt', 'ASC')
                .getOne()
            if (!notification) return null

            notification.status = PaymentAdminNotificationStatus.SENDING
            notification.attempts += 1
            notification.leaseToken = randomUUID()
            notification.leaseExpiresAt = new Date(now.getTime() + 2 * 60_000)
            notification.nextAttemptAt = null
            notification.lastErrorCode = null
            return manager.save(notification)
        })
    }

    private retryDelayMs(attempt: number): number {
        return [1, 5, 30, 120][Math.max(0, Math.min(attempt - 1, 3))] * 60_000
    }
}
