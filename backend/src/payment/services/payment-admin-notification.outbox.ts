import { EntityManager } from 'typeorm'

import { PaymentAdminNotification } from '../entity/payment-admin-notification.entity'
import { PaymentAdminNotificationStatus } from '../enum/payment-admin-notification-status.enum'

export async function enqueuePaymentAdminNotification(
    manager: EntityManager,
    paymentId: string,
    now = new Date(),
): Promise<void> {
    await manager
        .getRepository(PaymentAdminNotification)
        .createQueryBuilder()
        .insert()
        .into(PaymentAdminNotification)
        .values({
            paymentId,
            status: PaymentAdminNotificationStatus.PENDING,
            attempts: 0,
            nextAttemptAt: now,
            sentAt: null,
            leaseToken: null,
            leaseExpiresAt: null,
            lastErrorCode: null,
        })
        .orIgnore()
        .execute()
}
