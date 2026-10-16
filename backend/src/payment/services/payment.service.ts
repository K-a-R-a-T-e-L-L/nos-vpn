import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseService } from '@common/database/base/base.service'

import { PaymentCreateService } from './payment-create.service'
import { PaymentStatusService } from './payment-status.service'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { CreatePaymentDto } from '../dto/create-payment.dto'
import { UpdatePaymentDto } from '../dto/update-payment.dto'
import { Payment } from '../entity/payment.entity'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PlategaMerchantProfile } from '../providers/platega-payment.provider'

export { BONUS_BALANCE_PROVIDER, PROMO_FULL_DISCOUNT_PROVIDER } from './payment-create.service'

@Injectable()
export class PaymentService extends BaseService<Payment, CreatePaymentDto, UpdatePaymentDto> {
    constructor(
        @InjectRepository(Payment) paymentRepository: Repository<Payment>,
        private readonly paymentCreate: PaymentCreateService,
        private readonly paymentStatus: PaymentStatusService,
    ) {
        super(paymentRepository)
    }

    async createPayment(
        subscription: string | Subscription,
        planId?: string,
        promoCode?: string,
        merchantProfile: PlategaMerchantProfile = 'bot',
    ) {
        return this.paymentCreate.createPayment(subscription, planId, promoCode, merchantProfile)
    }

    async createCryptoPaymentForUser(
        userId: string,
        planId: string,
        promoCode?: string,
        merchantProfile: PlategaMerchantProfile = 'web',
    ) {
        const subscription = await this.paymentCreate.getSubscriptionForUser(userId)
        return this.paymentCreate.createPayment(subscription, planId, promoCode, merchantProfile, {
            checkoutMode: PaymentCheckoutMode.PLATEGA_CRYPTO,
        })
    }

    async createBonusPayment(
        subscription: string | Subscription,
        planId?: string,
        options: { notifySuccess?: boolean } = {},
    ) {
        return this.paymentCreate.createBonusPayment(subscription, planId, options)
    }

    async handlePlategaWebhook(data: any, headers: Record<string, any>, rawBody?: Buffer | string) {
        return this.paymentStatus.handlePlategaWebhook(data, headers, rawBody)
    }

    async checkLatestPendingPaymentForUser(userId: string) {
        return this.paymentStatus.checkLatestPendingPaymentForUser(userId)
    }

    async checkPaymentForUser(paymentId: string, userId: string) {
        return this.paymentStatus.checkPaymentForUser(paymentId, userId)
    }
}
