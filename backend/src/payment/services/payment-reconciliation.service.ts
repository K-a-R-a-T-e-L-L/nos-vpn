import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { PaymentCanonicalProcessingService } from './payment-canonical-processing.service'
import { PaymentMethodService } from './payment-method.service'
import { PaymentReceiptPolicyService } from './payment-receipt-policy.service'
import { SubscriptionRenewal } from '../../subscription/entity/subscription-renewal.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { SubscriptionAutoRenewStatus } from '../../subscription/enum/subscription-auto-renew-status.enum'
import { Payment } from '../entity/payment.entity'
import { PaymentMethodStatus } from '../enum/payment-method-status.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { YooKassaPaymentProvider } from '../providers/yookassa-payment.provider'

@Injectable()
export class PaymentReconciliationService {
    constructor(
        private readonly config: ConfigService,
        private readonly provider: YooKassaPaymentProvider,
        private readonly canonical: PaymentCanonicalProcessingService,
        private readonly methods: PaymentMethodService,
        private readonly receiptPolicy: PaymentReceiptPolicyService,
        @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    ) {}

    @Cron('*/10 * * * *')
    async reconcilePending(): Promise<void> {
        if (this.config.get<string>('PAYMENT_YOOKASSA_STATUS_RECONCILIATION_ENABLED') !== 'true') return
        const payments = await this.payments.find({
            where: {
                provider: 'yookassa',
                status: In([PaymentStatusEnum.PENDING]),
            },
            order: { createdAt: 'ASC', id: 'ASC' },
            take: 100,
        })
        for (const payment of payments) {
            if (!payment.merchant) continue
            try {
                const canonical = payment.providerPaymentId
                    ? await this.provider.getPayment({
                          providerPaymentId: payment.providerPaymentId,
                          merchant: payment.merchant,
                      })
                    : await this.retrySameRecurrentCreate(payment)
                if (!canonical) continue
                if (!payment.providerPaymentId) {
                    payment.providerPaymentId = canonical.providerPaymentId
                    payment.paymentPayId = canonical.providerPaymentId
                    payment.externalStatus = canonical.externalStatus
                    await this.payments.save(payment)
                }
                await this.canonical.processCanonicalPayment({
                    paymentId: payment.id,
                    merchant: payment.merchant,
                    canonical,
                    source: 'RECONCILIATION',
                })
            } catch {
                // Durable PENDING state is intentionally retained for the next bounded retry.
            }
        }
    }

    private async retrySameRecurrentCreate(payment: Payment) {
        if (!payment.isRecurring || !payment.idempotencyKey || !payment.subscriptionId || !payment.planId) {
            return null
        }
        const subscription = await this.payments.manager.getRepository(Subscription).findOne({
            where: { id: payment.subscriptionId },
            relations: { plan: true, user: true },
        })
        const renewalId = String(payment.metadataSnapshot?.renewal_id || '')
        const renewal = renewalId
            ? await this.payments.manager.getRepository(SubscriptionRenewal).findOneBy({ id: renewalId })
            : null
        if (!subscription || !renewal || subscription.autoRenewPaymentMethodId !== payment.paymentMethodId) return null
        const method = await this.methods.getActiveForSubscription(subscription)
        if (
            payment.merchant !== subscription.autoRenewMerchant ||
            method.merchant !== subscription.autoRenewMerchant ||
            method.provider !== PaymentProvider.YOOKASSA ||
            method.status !== PaymentMethodStatus.ACTIVE
        ) {
            await this.payments.manager.getRepository(Subscription).update(subscription.id, {
                autoRenewStatus: SubscriptionAutoRenewStatus.MANUAL_ACTION_REQUIRED,
                nextPaymentAt: null,
            })
            return null
        }
        return this.provider.createRecurrentPayment({
            localPaymentId: payment.id,
            renewalId: renewal.id,
            attemptNumber: renewal.attemptCount,
            idempotencyKey: payment.idempotencyKey,
            merchant: payment.merchant,
            amountRub: Number(payment.amount),
            description: 'Продление подписки NOS VPN',
            providerPaymentMethodId: method.providerMethodId,
            subscriptionId: subscription.id,
            planId: payment.planId,
            receipt: this.receiptPolicy.buildReceipt({
                merchant: payment.merchant,
                customerEmail: subscription.user?.email,
                amountRub: Number(payment.amount),
                itemDescription: 'Продление подписки NOS VPN',
            }),
        })
    }
}
