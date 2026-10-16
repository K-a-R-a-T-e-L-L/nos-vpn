import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import { PaymentMethod } from '../../payment/entity/payment-method.entity'
import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { PaymentMethodStatus } from '../../payment/enum/payment-method-status.enum'
import { PaymentProvider } from '../../payment/enum/payment-provider.enum'
import { PaymentMethodService } from '../../payment/services/payment-method.service'
import { Subscription } from '../entity/subscription.entity'
import { SubscriptionAutoRenewStatus } from '../enum/subscription-auto-renew-status.enum'

@Injectable()
export class SubscriptionAutoRenewService {
    constructor(
        @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
        private readonly paymentMethods: PaymentMethodService,
    ) {}

    async enable(userId: string, merchant: PaymentMerchant) {
        const subscription = await this.subscriptions.findOne({ where: { userId } })
        if (!subscription) throw new ConflictException('Subscription not found')
        const method = await this.paymentMethods.findLatestActiveForUserMerchant(userId, merchant)
        if (!method) throw new ConflictException('Complete a YooKassa payment before enabling auto-renew')
        const now = new Date()
        subscription.autoRenewEnabled = true
        subscription.autoRenewStatus = SubscriptionAutoRenewStatus.ACTIVE
        subscription.autoRenewMerchant = merchant
        subscription.autoRenewPaymentMethodId = method.id
        subscription.autoRenewEnabledAt = now
        subscription.autoRenewCanceledAt = null
        subscription.autoRenewFailureCount = 0
        subscription.nextPaymentAt = subscription.endsAt && subscription.endsAt > now ? subscription.endsAt : now
        await this.subscriptions.save(subscription)
        return this.toDto(subscription, method)
    }

    async disable(userId: string) {
        const subscription = await this.subscriptions.findOne({ where: { userId } })
        if (!subscription) throw new ConflictException('Subscription not found')
        subscription.autoRenewEnabled = false
        subscription.autoRenewStatus = SubscriptionAutoRenewStatus.DISABLED
        subscription.autoRenewCanceledAt = new Date()
        subscription.nextPaymentAt = null
        await this.subscriptions.save(subscription)
        return this.toDto(subscription, null)
    }

    async enableFromProviderSavedMethod(
        manager: EntityManager,
        input: {
            subscriptionId: string
            userId: string
            merchant: PaymentMerchant
            paymentMethodId: string
            enabledAt: Date
        },
    ): Promise<Subscription> {
        const subscription = await manager
            .getRepository(Subscription)
            .createQueryBuilder('subscription')
            .setLock('pessimistic_write')
            .where('subscription.id = :subscriptionId', { subscriptionId: input.subscriptionId })
            .getOne()
        if (!subscription || subscription.userId !== input.userId) {
            throw new ConflictException('Subscription ownership mismatch')
        }
        const method = await manager.getRepository(PaymentMethod).findOne({
            where: {
                id: input.paymentMethodId,
                userId: input.userId,
                merchant: input.merchant,
                provider: PaymentProvider.YOOKASSA,
                status: PaymentMethodStatus.ACTIVE,
            },
        })
        if (!method) throw new ConflictException('Saved YooKassa payment method is unavailable')
        subscription.autoRenewEnabled = true
        subscription.autoRenewStatus = SubscriptionAutoRenewStatus.ACTIVE
        subscription.autoRenewMerchant = input.merchant
        subscription.autoRenewPaymentMethodId = method.id
        subscription.autoRenewEnabledAt = input.enabledAt
        subscription.autoRenewCanceledAt = null
        subscription.autoRenewFailureCount = 0
        subscription.nextPaymentAt =
            subscription.endsAt && subscription.endsAt > input.enabledAt ? subscription.endsAt : input.enabledAt
        return manager.save(subscription)
    }

    async get(userId: string) {
        const subscription = await this.subscriptions.findOne({
            where: { userId },
            relations: { autoRenewPaymentMethod: true },
        })
        if (!subscription) throw new ConflictException('Subscription not found')
        return this.toDto(subscription, subscription.autoRenewPaymentMethod || null)
    }

    private toDto(subscription: Subscription, method: any) {
        return {
            enabled: Boolean(subscription.autoRenewEnabled),
            status: subscription.autoRenewStatus || SubscriptionAutoRenewStatus.DISABLED,
            merchant: subscription.autoRenewMerchant || null,
            nextPaymentAt: subscription.nextPaymentAt || null,
            lastPaymentAt: subscription.lastPaymentAt || null,
            method: method
                ? { type: method.methodType || null, title: method.displayTitle || null, last4: method.last4 || null }
                : null,
        }
    }
}
