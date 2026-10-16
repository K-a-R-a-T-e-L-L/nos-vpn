import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectBot } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'
import { Repository } from 'typeorm'

import { PAYMENT_SUBSCRIPTION_SERVICE } from './payment-service.tokens'
import { BOT_CALLBACK } from '../../bot/bot.constants'
import { CUSTOM_EMOJI, tgEmoji } from '../../bot/custom-emoji.registry'
import { PaymentPromoLifecycleService } from '../../promo/services/payment-promo-lifecycle.service'
import type { SubscriptionService } from '../../subscription/services/subscription.service'
import { Payment } from '../entity/payment.entity'

@Injectable()
export class PaymentSideEffectsService {
    private readonly logger = new Logger('PaymentService')

    constructor(
        @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
        @Inject(PAYMENT_SUBSCRIPTION_SERVICE) private readonly subscriptionService: SubscriptionService,
        private readonly paymentPromoLifecycle: PaymentPromoLifecycleService,
        @InjectBot() private readonly bot: Telegraf,
    ) {}

    async finalizePaymentPromo(payment: Payment, promoCodeId: string, appliedAt: Date) {
        if (!payment.userId) {
            throw new Error('Payment promo user linkage is missing')
        }
        await this.paymentRepository.manager.transaction((manager) =>
            this.paymentPromoLifecycle.finalizeSuccessfulPayment(manager, {
                paymentId: payment.id,
                userId: payment.userId!,
                promoCodeId,
                subscriptionId: payment.subscriptionId,
                appliedAt,
            }),
        )
    }

    async cancelPaymentPromo(payment: Payment, promoCodeId: string, canceledAt: Date) {
        if (!payment.userId) {
            throw new Error('Payment promo user linkage is missing')
        }
        await this.paymentRepository.manager.transaction((manager) =>
            this.paymentPromoLifecycle.cancelFailedPayment(manager, {
                paymentId: payment.id,
                userId: payment.userId!,
                promoCodeId,
                canceledAt,
            }),
        )
    }

    async notifyPaymentSucceeded(payment: Payment) {
        try {
            const subscription = payment.subscriptionId
                ? await this.subscriptionService.getOne({
                      where: { id: payment.subscriptionId },
                      relations: { user: true },
                  })
                : null
            const telegramId = subscription?.user?.telegramId
            if (!telegramId) {
                return
            }

            await this.bot.telegram.sendMessage(
                telegramId,
                `${tgEmoji('MENU_BUTTON_RENEW')} Оплата прошла успешно. Доступ активирован.`,
                {
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                `${CUSTOM_EMOJI.MENU_BUTTON_GET_ACCESS.fallback} Получить доступ`,
                                BOT_CALLBACK.GET_ACCESS,
                            ),
                        ],
                        [
                            Markup.button.callback(
                                `${CUSTOM_EMOJI.MENU_BUTTON_MY_SUBSCRIPTION.fallback} Моя подписка`,
                                BOT_CALLBACK.MY_SUBSCRIPTION,
                            ),
                        ],
                    ]),
                    parse_mode: 'HTML',
                } as any,
            )
        } catch (error: any) {
            this.logger.warn(`Payment success notification failed: ${error?.message || 'unknown'}`)
        }
    }
}
