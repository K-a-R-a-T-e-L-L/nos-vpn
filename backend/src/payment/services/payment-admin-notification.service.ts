import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { NotificationService } from '../../notification/notification.service'
import { Plan } from '../../plan/entity/plan.entity'
import { PromoCode } from '../../promo/entity/promo-code.entity'
import { User } from '../../system/user/entity/user.entity'
import { Payment } from '../entity/payment.entity'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentAdminNotificationError } from '../types/payment-admin-notification.error'

@Injectable()
export class PaymentAdminNotificationService {
    private readonly logger = new Logger(PaymentAdminNotificationService.name)

    constructor(
        private readonly config: ConfigService,
        private readonly notification: NotificationService,
        @InjectRepository(Payment) private readonly payments: Repository<Payment>,
        @InjectRepository(User) private readonly users: Repository<User>,
        @InjectRepository(Plan) private readonly plans: Repository<Plan>,
        @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    ) {}

    async send(paymentId: string): Promise<void> {
        const adminChatId = String(this.config.get<string>('TELEGRAM_ADMINCHAT_ID') || '').trim()
        if (!adminChatId) {
            throw new PaymentAdminNotificationError('ADMIN_CHAT_NOT_CONFIGURED', true)
        }

        const context = await this.loadContext(paymentId)
        const message = await this.formatMessage(context)
        try {
            await this.notification.notify(adminChatId, message, { parse_mode: 'HTML' })
        } catch (error) {
            const classified = this.classifyTelegramError(error)
            if (classified.code === 'TELEGRAM_CHAT_MIGRATED') {
                this.logger.warn('Telegram admin chat migration requires an operational TELEGRAM_ADMINCHAT_ID update')
            }
            throw classified
        }
    }

    private async loadContext(paymentId: string) {
        const raw = await this.payments
            .createQueryBuilder('payment')
            .select('payment.id', 'id')
            .addSelect('payment.amount', 'amount')
            .addSelect('payment.currency', 'currency')
            .addSelect('payment.provider', 'provider')
            .addSelect('payment.merchant', 'merchant')
            .addSelect('payment.isRecurring', 'isRecurring')
            .addSelect('payment.status', 'status')
            .addSelect('payment.paidAt', 'paidAt')
            .addSelect('payment.activationStatus', 'activationStatus')
            .addSelect('payment.userId', 'userId')
            .addSelect('payment.planId', 'planId')
            .addSelect("payment.metadata_snapshot ->> 'promo_id'", 'promoId')
            .where('payment.id = :paymentId', { paymentId })
            .getRawOne()
        const payment = raw
            ? ({
                  id: raw.id,
                  amount: Number(raw.amount),
                  currency: raw.currency,
                  provider: raw.provider,
                  merchant: raw.merchant,
                  isRecurring: raw.isRecurring === true || raw.isRecurring === 'true',
                  status: raw.status,
                  paidAt: raw.paidAt ? new Date(raw.paidAt) : null,
                  activationStatus: raw.activationStatus,
                  userId: raw.userId,
                  planId: raw.planId,
              } as Payment)
            : null
        if (
            !payment ||
            payment.status !== PaymentStatusEnum.SUCCEEDED ||
            Number(payment.amount) <= 0 ||
            !payment.paidAt ||
            !Number.isFinite(payment.paidAt.getTime())
        ) {
            throw new PaymentAdminNotificationError('PAYMENT_CONTEXT_NOT_FOUND', true)
        }

        const [user, plan] = await Promise.all([
            payment.userId
                ? this.users.findOne({
                      where: { id: payment.userId },
                      select: {
                          id: true,
                          email: true,
                          telegramUsername: true,
                          telegramFirstName: true,
                          telegramLastName: true,
                      },
                  })
                : null,
            payment.planId
                ? this.plans.findOne({
                      where: { id: payment.planId },
                      select: { id: true, title: true, name: true, code: true },
                  })
                : null,
        ])
        const promoId = String(raw.promoId || '').trim()
        const promo = promoId
            ? await this.promos.findOne({ where: { id: promoId }, select: { id: true, code: true } })
            : null
        return { payment, user, plan, promo }
    }

    private async formatMessage(context: Awaited<ReturnType<PaymentAdminNotificationService['loadContext']>>) {
        const { payment, user, plan, promo } = context
        const hasEarlierPayment = payment.isRecurring ? true : await this.hasEarlierSuccessfulPayment(payment)
        const values = {
            user: this.buildUserLabel(user || {}, payment.userId || payment.id),
            merchant: payment.merchant || 'UNKNOWN',
            type: this.classifyPaymentType(payment.isRecurring, hasEarlierPayment),
            provider: this.formatProvider(payment.provider),
            plan: plan?.title || plan?.name || plan?.code || 'не указан',
            amount: this.formatAmount(payment.amount, payment.currency),
            promo: promo?.code || 'нет',
            paidAt: this.formatPaidAt(payment.paidAt!),
            paymentId: payment.id.slice(0, 8),
            activation: payment.activationStatus || 'PENDING',
        }
        return [
            '💰 <b>Новая успешная оплата</b>',
            '',
            `Кто: ${this.escapeHtml(values.user)}`,
            `Канал: ${this.escapeHtml(values.merchant)}`,
            `Тип: ${this.escapeHtml(values.type)}`,
            `Провайдер: ${this.escapeHtml(values.provider)}`,
            `Тариф: ${this.escapeHtml(values.plan)}`,
            `Сумма: ${this.escapeHtml(values.amount)}`,
            `Промокод: ${this.escapeHtml(values.promo)}`,
            `Дата: ${this.escapeHtml(values.paidAt)}`,
            `Payment: ${this.escapeHtml(values.paymentId)}`,
            `Активация: ${this.escapeHtml(values.activation)}`,
        ].join('\n')
    }

    private async hasEarlierSuccessfulPayment(payment: Payment): Promise<boolean> {
        if (!payment.userId || !payment.paidAt) return false
        return this.payments
            .createQueryBuilder('payment')
            .where('payment.userId = :userId', { userId: payment.userId })
            .andWhere('payment.status = :status', { status: PaymentStatusEnum.SUCCEEDED })
            .andWhere('(payment.paidAt < :paidAt OR (payment.paidAt = :paidAt AND payment.id < :paymentId))', {
                paidAt: payment.paidAt,
                paymentId: payment.id,
            })
            .getExists()
    }

    private classifyPaymentType(isRecurring: boolean, hasEarlierPayment: boolean): string {
        if (isRecurring) return 'Автосписание'
        return hasEarlierPayment ? 'Ручное продление' : 'Первая покупка'
    }

    private buildUserLabel(user: Partial<User>, fallbackId: string): string {
        if (user.telegramUsername) return `@${user.telegramUsername}`
        if (user.email) return user.email
        const name = [user.telegramFirstName, user.telegramLastName].filter(Boolean).join(' ').trim()
        return name || `user #${fallbackId.slice(0, 8)}`
    }

    private formatProvider(provider: string): string {
        const normalized = String(provider).toUpperCase()
        if (normalized === PaymentProvider.YOOKASSA) return 'YooKassa'
        if (normalized === PaymentProvider.PLATEGA) return 'Platega'
        return 'Неизвестный'
    }

    private formatAmount(amount: number, currency: string): string {
        return `${Number(amount).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    }

    private formatPaidAt(value: Date): string {
        return new Intl.DateTimeFormat('ru-RU', {
            timeZone: 'Europe/Moscow',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
        }).format(value)
    }

    private escapeHtml(value: unknown): string {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    private classifyTelegramError(error: any): PaymentAdminNotificationError {
        if (error?.response?.parameters?.migrate_to_chat_id || error?.parameters?.migrate_to_chat_id) {
            return new PaymentAdminNotificationError('TELEGRAM_CHAT_MIGRATED', true)
        }
        const status = Number(error?.response?.error_code || error?.response?.statusCode || error?.code)
        if (status === 403) return new PaymentAdminNotificationError('TELEGRAM_FORBIDDEN', true)
        if (status === 429) return new PaymentAdminNotificationError('TELEGRAM_RATE_LIMITED', false)
        if (status >= 500 || error instanceof Error) {
            return new PaymentAdminNotificationError('TELEGRAM_TEMPORARY_ERROR', false)
        }
        return new PaymentAdminNotificationError('TELEGRAM_UNKNOWN_ERROR', false)
    }
}
