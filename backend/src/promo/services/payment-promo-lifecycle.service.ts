import { Injectable } from '@nestjs/common'
import { EntityManager, ObjectLiteral } from 'typeorm'

import { Payment } from '../../payment/entity/payment.entity'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { PromoUsage, PromoUsageStatusEnum } from '../entity/promo-usage.entity'
import { PromoLifecycleError, PromoLifecycleErrorCode } from '../errors/promo-lifecycle.error'

type PaymentPromoInput = {
    paymentId: string
    userId: string
    promoCodeId: string
}

@Injectable()
export class PaymentPromoLifecycleService {
    async finalizeSuccessfulPayment(
        manager: EntityManager,
        input: PaymentPromoInput & {
            subscriptionId?: string | null
            appliedAt: Date
        },
    ): Promise<{ status: 'APPLIED' | 'ALREADY_APPLIED' }> {
        const payment = await this.lockOne(manager, Payment, 'payment', 'payment.id = :paymentId', {
            paymentId: input.paymentId,
        })
        this.assertPayment(payment, input, true)

        const usage = await this.lockOne(
            manager,
            PromoUsage,
            'promoUsage',
            'promoUsage.promoCodeId = :promoCodeId',
            { promoCodeId: input.promoCodeId, userId: input.userId },
            'promoUsage.userId = :userId',
        )
        if (!usage) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_USAGE_NOT_FOUND')
        }
        if (usage.status === PromoUsageStatusEnum.CANCELED) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_USAGE_CANCELED')
        }
        if (usage.status !== PromoUsageStatusEnum.RESERVED && usage.status !== PromoUsageStatusEnum.APPLIED) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_USAGE_NOT_FOUND')
        }

        if (input.subscriptionId) {
            const subscriptionRepository = manager.getRepository(Subscription)
            const subscription = await this.lockOne(
                manager,
                Subscription,
                'subscription',
                'subscription.id = :subscriptionId',
                { subscriptionId: input.subscriptionId },
            )
            if (!subscription || subscription.userId !== input.userId) {
                throw new PromoLifecycleError('PROMO_LIFECYCLE_SUBSCRIPTION_MISMATCH')
            }
            if (subscription.sourcePromoCodeId !== input.promoCodeId) {
                subscription.sourcePromoCodeId = input.promoCodeId
                await subscriptionRepository.save(subscription)
            }
        }

        if (usage.status === PromoUsageStatusEnum.APPLIED) {
            return { status: 'ALREADY_APPLIED' }
        }

        usage.status = PromoUsageStatusEnum.APPLIED
        usage.appliedAt = input.appliedAt
        await manager.save(usage)
        return { status: 'APPLIED' }
    }

    async cancelFailedPayment(
        manager: EntityManager,
        input: PaymentPromoInput & { canceledAt: Date },
    ): Promise<{ status: 'CANCELED' | 'ALREADY_CANCELED' | 'ALREADY_APPLIED' }> {
        const payment = await this.lockOne(manager, Payment, 'payment', 'payment.id = :paymentId', {
            paymentId: input.paymentId,
        })
        if (!payment) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_PAYMENT_NOT_FOUND')
        }
        if (payment.id !== input.paymentId || payment.userId !== input.userId) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_PAYMENT_MISMATCH')
        }
        const paymentPromoId = String(payment.metadataSnapshot?.promo_id || '').trim()
        if (!paymentPromoId) {
            return { status: 'ALREADY_CANCELED' }
        }
        if (paymentPromoId !== input.promoCodeId) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_PAYMENT_MISMATCH')
        }

        const usage = await this.lockOne(
            manager,
            PromoUsage,
            'promoUsage',
            'promoUsage.promoCodeId = :promoCodeId',
            { promoCodeId: input.promoCodeId, userId: input.userId },
            'promoUsage.userId = :userId',
        )
        if (!usage) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_USAGE_NOT_FOUND')
        }
        if (usage.status === PromoUsageStatusEnum.APPLIED) {
            return { status: 'ALREADY_APPLIED' }
        }
        if (usage.status === PromoUsageStatusEnum.CANCELED) {
            return { status: 'ALREADY_CANCELED' }
        }

        usage.status = PromoUsageStatusEnum.CANCELED
        await manager.save(usage)
        return { status: 'CANCELED' }
    }

    private assertPayment(payment: Payment | null, input: PaymentPromoInput, requireSucceeded: boolean) {
        if (!payment) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_PAYMENT_NOT_FOUND')
        }
        const paymentPromoId = String(payment.metadataSnapshot?.promo_id || '')
        if (
            payment.id !== input.paymentId ||
            payment.userId !== input.userId ||
            paymentPromoId !== input.promoCodeId ||
            (requireSucceeded && payment.status !== PaymentStatusEnum.SUCCEEDED)
        ) {
            throw new PromoLifecycleError('PROMO_LIFECYCLE_PAYMENT_MISMATCH')
        }
    }

    private lockOne<T extends ObjectLiteral>(
        manager: EntityManager,
        entity: new () => T,
        alias: string,
        where: string,
        parameters: Record<string, unknown>,
        andWhere?: string,
    ): Promise<T | null> {
        const query = manager
            .getRepository(entity)
            .createQueryBuilder(alias)
            .setLock('pessimistic_write')
            .where(where, parameters)
        if (andWhere) {
            query.andWhere(andWhere, parameters)
        }
        return query.getOne()
    }
}
