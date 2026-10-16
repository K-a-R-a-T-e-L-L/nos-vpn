import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Subscription } from '../../subscription/entity/subscription.entity'
import { PaymentMethod } from '../entity/payment-method.entity'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentMethodStatus } from '../enum/payment-method-status.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'

@Injectable()
export class PaymentMethodService {
    constructor(@InjectRepository(PaymentMethod) private readonly repository: Repository<PaymentMethod>) {}

    async saveCanonicalMethod(input: {
        userId: string
        merchant: PaymentMerchant
        providerMethodId: string
        methodType?: string | null
        displayTitle?: string | null
        last4?: string | null
    }): Promise<PaymentMethod> {
        const providerMethodId = String(input.providerMethodId || '').trim()
        if (!providerMethodId) throw new ConflictException('YooKassa payment method is missing')
        let method = await this.repository
            .createQueryBuilder('method')
            .addSelect('method.providerMethodId')
            .where('method.provider = :provider', { provider: PaymentProvider.YOOKASSA })
            .andWhere('method.merchant = :merchant', { merchant: input.merchant })
            .andWhere('method.providerMethodId = :providerMethodId', { providerMethodId })
            .getOne()
        if (method && method.userId !== input.userId) {
            throw new ConflictException('Payment method ownership conflict')
        }
        method =
            method ||
            this.repository.create({
                userId: input.userId,
                provider: PaymentProvider.YOOKASSA,
                merchant: input.merchant,
                providerMethodId,
            })
        method.status = PaymentMethodStatus.ACTIVE
        method.revokedAt = null
        method.lastUsedAt = new Date()
        method.methodType = this.safeText(input.methodType, 64)
        method.displayTitle = this.safeText(input.displayTitle, 128)
        method.last4 = /^\d{4}$/.test(String(input.last4 || '')) ? String(input.last4) : null
        return this.repository.save(method)
    }

    findLatestActiveForUserMerchant(userId: string, merchant: PaymentMerchant) {
        return this.repository.findOne({
            where: { userId, merchant, provider: PaymentProvider.YOOKASSA, status: PaymentMethodStatus.ACTIVE },
            order: { lastUsedAt: 'DESC', createdAt: 'DESC' },
        })
    }

    async getActiveForSubscription(subscription: Subscription) {
        if (!subscription.autoRenewPaymentMethodId || !subscription.autoRenewMerchant) {
            throw new ConflictException('Auto-renew payment method is not configured')
        }
        const method = await this.repository
            .createQueryBuilder('method')
            .addSelect('method.providerMethodId')
            .where('method.id = :id', { id: subscription.autoRenewPaymentMethodId })
            .andWhere('method.userId = :userId', { userId: subscription.userId })
            .andWhere('method.merchant = :merchant', { merchant: subscription.autoRenewMerchant })
            .andWhere('method.status = :status', { status: PaymentMethodStatus.ACTIVE })
            .getOne()
        if (!method) throw new ConflictException('Active payment method is unavailable')
        return method
    }

    async revokeMethod(methodId: string, _reason: string): Promise<void> {
        await this.repository.update(
            { id: methodId },
            { status: PaymentMethodStatus.REVOKED, revokedAt: new Date() },
        )
    }

    private safeText(value: unknown, max: number): string | null {
        const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
        return text ? Array.from(text).slice(0, max).join('') : null
    }
}
