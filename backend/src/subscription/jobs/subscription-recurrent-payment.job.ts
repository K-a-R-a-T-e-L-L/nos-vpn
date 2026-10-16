import { randomUUID } from 'crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { DataSource } from 'typeorm'

import { NotificationService } from '../../notification/notification.service'
import { PaymentAttempt } from '../../payment/entity/payment-attempt.entity'
import { Payment } from '../../payment/entity/payment.entity'
import { PaymentAttemptStatus } from '../../payment/enum/payment-attempt-status.enum'
import { PaymentAttemptType } from '../../payment/enum/payment-attempt-type.enum'
import { PaymentKind } from '../../payment/enum/payment-kind.enum'
import { PaymentMethodStatus } from '../../payment/enum/payment-method-status.enum'
import { PaymentProvider } from '../../payment/enum/payment-provider.enum'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'
import { YooKassaPaymentProvider } from '../../payment/providers/yookassa-payment.provider'
import { PaymentCanonicalProcessingService } from '../../payment/services/payment-canonical-processing.service'
import { PaymentMethodService } from '../../payment/services/payment-method.service'
import { PaymentReceiptPolicyService } from '../../payment/services/payment-receipt-policy.service'
import { SubscriptionRenewal } from '../entity/subscription-renewal.entity'
import { Subscription } from '../entity/subscription.entity'
import { StatusesEnum } from '../enum/statuses.enum'
import { SubscriptionAutoRenewStatus } from '../enum/subscription-auto-renew-status.enum'
import { SubscriptionRenewalStatus } from '../enum/subscription-renewal-status.enum'

export function createRecurrentIdempotencyKey() {
    return randomUUID()
}

@Injectable()
export class SubscriptionRecurrentPaymentJob {
    constructor(
        private readonly dataSource: DataSource,
        private readonly config: ConfigService,
        private readonly methods: PaymentMethodService,
        private readonly receiptPolicy: PaymentReceiptPolicyService,
        private readonly provider: YooKassaPaymentProvider,
        private readonly canonical: PaymentCanonicalProcessingService,
        private readonly notifications: NotificationService,
    ) {}

    @Cron('7 * * * *')
    async run(now = new Date()): Promise<void> {
        if (this.config.get<string>('PAYMENT_RECURRENT_ENABLED') !== 'true') return
        let claim: any
        try {
            claim = await this.dataSource.transaction(async (manager) => {
                const subscriptionRepository = manager.getRepository(Subscription)
                const claimedSubscription = await subscriptionRepository
                    .createQueryBuilder('subscription')
                    .setLock('pessimistic_write')
                    .setOnLocked('skip_locked')
                    .where('subscription.autoRenewEnabled = true')
                    .andWhere('subscription.autoRenewStatus IN (:...states)', {
                        states: [SubscriptionAutoRenewStatus.ACTIVE, SubscriptionAutoRenewStatus.RETRY_SCHEDULED],
                    })
                    .andWhere('subscription.nextPaymentAt <= :now', { now })
                    .andWhere('subscription.status != :stopped', { stopped: StatusesEnum.STOPPED })
                    .andWhere('subscription.autoRenewPaymentMethodId IS NOT NULL')
                    .andWhere('subscription.autoRenewMerchant IS NOT NULL')
                    .orderBy('subscription.nextPaymentAt', 'ASC')
                    .addOrderBy('subscription.id', 'ASC')
                    .getOne()
                if (!claimedSubscription) return null

                // PostgreSQL does not allow FOR UPDATE on the nullable side of an
                // outer join. Claim/lock the subscription row first, then load its
                // relations while the row lock is still held by this transaction.
                const subscription = await subscriptionRepository.findOne({
                    where: { id: claimedSubscription.id },
                    relations: { plan: true, user: true },
                })
                if (!subscription) return null

                const billingPeriodKey = (subscription.endsAt || subscription.nextPaymentAt).toISOString()
                let renewal = await manager.getRepository(SubscriptionRenewal).findOne({
                    where: { subscriptionId: subscription.id, billingPeriodKey },
                })
                if (
                    renewal &&
                    [
                        SubscriptionRenewalStatus.SUCCEEDED,
                        SubscriptionRenewalStatus.PENDING,
                        SubscriptionRenewalStatus.IN_PROGRESS,
                    ].includes(renewal.status)
                )
                    return null

                renewal =
                    renewal ||
                    manager.create(SubscriptionRenewal, {
                        subscriptionId: subscription.id,
                        paymentMethodId: subscription.autoRenewPaymentMethodId,
                        merchant: subscription.autoRenewMerchant,
                        periodStart: subscription.endsAt || subscription.nextPaymentAt,
                        periodEnd: new Date(
                            (subscription.endsAt || subscription.nextPaymentAt).getTime() +
                                subscription.plan.period * 86400000,
                        ),
                        billingPeriodKey,
                        status: SubscriptionRenewalStatus.PLANNED,
                        attemptCount: 0,
                    })
                if (renewal.attemptCount >= 3) {
                    subscription.autoRenewStatus = SubscriptionAutoRenewStatus.MANUAL_ACTION_REQUIRED
                    await manager.save(subscription)
                    return null
                }

                const attemptNumber = renewal.attemptCount + 1
                const idempotencyKey = createRecurrentIdempotencyKey()
                renewal.status = SubscriptionRenewalStatus.IN_PROGRESS
                renewal.attemptCount = attemptNumber
                await manager.save(renewal)

                const payment = await manager.save(
                    Payment,
                    manager.create(Payment, {
                        provider: 'yookassa',
                        kind: PaymentKind.EXTERNAL,
                        merchant: subscription.autoRenewMerchant,
                        status: PaymentStatusEnum.PENDING,
                        isRecurring: true,
                        userId: subscription.userId,
                        subscriptionId: subscription.id,
                        planId: subscription.planId,
                        paymentMethodId: subscription.autoRenewPaymentMethodId,
                        billingPeriodKey,
                        amount: Number(subscription.plan.amount),
                        currency: 'RUB',
                        idempotencyKey,
                        paymentPayId: '',
                        paymentLink: '',
                        paymentUrl: '',
                        returnUrl: '',
                        metadataSnapshot: { recurrent: true, renewal_id: renewal.id },
                    }),
                )
                await manager.save(
                    PaymentAttempt,
                    manager.create(PaymentAttempt, {
                        paymentId: payment.id,
                        renewalId: renewal.id,
                        attemptType: PaymentAttemptType.RECURRENT,
                        attemptNumber,
                        provider: this.provider.provider,
                        merchant: subscription.autoRenewMerchant,
                        idempotencyKey,
                        status: PaymentAttemptStatus.CREATED,
                        retryable: false,
                        startedAt: now,
                        requestSnapshot: {
                            amount: Number(subscription.plan.amount),
                            currency: 'RUB',
                            hasMethod: true,
                        },
                    }),
                )
                return { subscription, renewal, payment, attemptNumber, idempotencyKey }
            })
        } catch (error) {
            if (this.isRenewalPeriodUniqueConflict(error)) return
            throw error
        }
        if (!claim) return
        const method = await this.methods.getActiveForSubscription(claim.subscription)
        if (
            claim.payment.merchant !== claim.subscription.autoRenewMerchant ||
            method.merchant !== claim.subscription.autoRenewMerchant ||
            method.provider !== PaymentProvider.YOOKASSA ||
            method.status !== PaymentMethodStatus.ACTIVE
        ) {
            await this.dataSource.transaction(async (manager) => {
                await manager.getRepository(Subscription).update(claim.subscription.id, {
                    autoRenewStatus: SubscriptionAutoRenewStatus.MANUAL_ACTION_REQUIRED,
                    nextPaymentAt: null,
                })
                await manager.getRepository(SubscriptionRenewal).update(claim.renewal.id, {
                    status: SubscriptionRenewalStatus.MANUAL_ACTION_REQUIRED,
                    failureCode: 'MERCHANT_METHOD_MISMATCH',
                    failureMessage: 'Saved payment method does not match renewal merchant',
                })
                await manager.getRepository(PaymentAttempt).update(
                    { paymentId: claim.payment.id, attemptNumber: claim.attemptNumber },
                    {
                        status: PaymentAttemptStatus.FAILED,
                        retryable: false,
                        finishedAt: new Date(),
                        errorCode: 'MERCHANT_METHOD_MISMATCH',
                        errorMessage: 'Saved payment method does not match renewal merchant',
                    },
                )
            })
            return
        }
        try {
            const created = await this.provider.createRecurrentPayment({
                localPaymentId: claim.payment.id,
                renewalId: claim.renewal.id,
                attemptNumber: claim.attemptNumber,
                idempotencyKey: claim.idempotencyKey,
                merchant: claim.subscription.autoRenewMerchant,
                amountRub: Number(claim.subscription.plan.amount),
                description: 'Продление подписки NOS VPN',
                providerPaymentMethodId: method.providerMethodId,
                subscriptionId: claim.subscription.id,
                planId: claim.subscription.planId,
                receipt: this.receiptPolicy.buildReceipt({
                    merchant: claim.subscription.autoRenewMerchant,
                    customerEmail: claim.subscription.user?.email,
                    amountRub: Number(claim.subscription.plan.amount),
                    itemDescription: 'Продление подписки NOS VPN',
                }),
            })
            await this.dataSource.getRepository(Payment).update(claim.payment.id, {
                providerPaymentId: created.providerPaymentId,
                paymentPayId: created.providerPaymentId,
                externalStatus: created.externalStatus,
            })
            await this.canonical.processCanonicalPayment({
                paymentId: claim.payment.id,
                merchant: claim.subscription.autoRenewMerchant,
                canonical: created,
                source: 'RECURRENT_CREATE',
            })
            if (claim.subscription.user?.telegramId) {
                try {
                    const current = await this.dataSource.getRepository(Subscription).findOneBy({
                        id: claim.subscription.id,
                    })
                    const message =
                        created.status === PaymentStatusEnum.SUCCEEDED
                            ? `Автопродление выполнено. Подписка действует до ${current?.endsAt?.toLocaleString('ru-RU') || 'новой даты'}.`
                            : current?.autoRenewStatus === SubscriptionAutoRenewStatus.RETRY_SCHEDULED
                              ? `Автоплатёж не прошёл. Следующая попытка: ${current.nextPaymentAt?.toLocaleString('ru-RU') || 'позже'}.`
                              : 'Автоплатёж не выполнен. Нужна новая ручная оплата через ЮKassa.'
                    await this.notifications.notify(claim.subscription.user.telegramId, message)
                } catch {
                    // Payment durability is authoritative; notification failure must not alter renewal state.
                }
            }
        } catch {
            await this.dataSource.getRepository(SubscriptionRenewal).update(claim.renewal.id, {
                status: SubscriptionRenewalStatus.PENDING,
            })
            await this.dataSource.getRepository(PaymentAttempt).update(
                { paymentId: claim.payment.id, attemptNumber: claim.attemptNumber },
                { status: PaymentAttemptStatus.PENDING, retryable: true },
            )
        }
    }

    private isRenewalPeriodUniqueConflict(error: any): boolean {
        return (
            error?.code === '23505' &&
            String(error?.constraint || error?.message || '').includes('UQ_subscription_renewals_subscription_period')
        )
    }
}