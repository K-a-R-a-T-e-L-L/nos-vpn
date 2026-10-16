import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, ILike, In, Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { AnalyticsEvent } from '../../../analytics/entity/analytics-event.entity'
import { UserAttribution } from '../../../analytics/entity/user-attribution.entity'
import { SubscriptionBalance } from '../../../billing/entities/subscription-balance.entity'
import { PaymentAdminNotification } from '../../../payment/entity/payment-admin-notification.entity'
import { PaymentAttempt } from '../../../payment/entity/payment-attempt.entity'
import { PaymentMethod } from '../../../payment/entity/payment-method.entity'
import { PaymentWebhookEvent } from '../../../payment/entity/payment-webhook-event.entity'
import { Payment } from '../../../payment/entity/payment.entity'
import { PlategaRecurrentAgreement } from '../../../payment/entity/platega-recurrent-agreement.entity'
import { PromoUsage } from '../../../promo/entity/promo-usage.entity'
import { ReferralBonusLedger } from '../../../referral/entity/referral-bonus-ledger.entity'
import { SubscriptionRenewal } from '../../../subscription/entity/subscription-renewal.entity'
import { Subscription } from '../../../subscription/entity/subscription.entity'
import { StatusesEnum } from '../../../subscription/enum/statuses.enum'
import { SubscriptionService } from '../../../subscription/services/subscription.service'
import { SupportMessage } from '../../../support/entity/support-message.entity'
import { SupportThread } from '../../../support/entity/support-thread.entity'
import { SupportMessageContentKindEnum } from '../../../support/entity/support.enum'
import { SupportMediaStorageService } from '../../../support/services/support-media-storage.service'
import { VpnAccess } from '../../../vpn-access/entity/vpn-access.entity'
import { AccessOperationLog } from '../../../vpn-access/operations/access-operation-log.entity'
import { VpnAccessService } from '../../../vpn-access/services/vpn-access.service'
import { TelegramAuthRequest } from '../entity/telegram-auth-request.entity'
import { TelegramSiteLinkRequest } from '../entity/telegram-site-link-request.entity'
import { User } from '../entity/user.entity'

@Injectable()
export class UserDeleteService {
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        private readonly subscriptionService: SubscriptionService,
        private readonly vpnAccessService: VpnAccessService,
        private readonly dataSource: DataSource,
        private readonly supportMediaStorage: SupportMediaStorageService,
    ) {}

    async permanentlyDeleteUser(userId: string, actorUserId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId }, relations: { subscription: true } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        if (user.id === actorUserId) {
            throw new ErrorDto(
                ErrorCodeEnum.FORBIDDEN,
                'Нельзя удалить собственную учётную запись из текущей административной сессии.',
            )
        }

        if (user.subscription?.id) {
            const current = await this.subscriptionService.getResolvedById(user.subscription.id)
            const provisionableAccess = await this.vpnAccessService.findProvisionableBySubscription(
                user.subscription.id,
            )
            if (
                provisionableAccess ||
                (current && [StatusesEnum.ACTIVE, StatusesEnum.GRACE, StatusesEnum.PENDING].includes(current.status))
            ) {
                await this.subscriptionService.stopSubscription(user.id)
            }
        }

        const storageKeys = await this.dataSource.transaction(async (manager) => this.deleteUserDatabaseGraph(manager, userId))
        if (storageKeys?.length && this.supportMediaStorage) await this.supportMediaStorage.cleanupMany(storageKeys)

        return { ok: true, id: userId }
    }

    private async deleteUserDatabaseGraph(manager: EntityManager, userId: string) {
        const userRepository = manager.getRepository(User)
        const subscriptionRepository = manager.getRepository(Subscription)
        const renewalRepository = manager.getRepository(SubscriptionRenewal)
        const balanceRepository = manager.getRepository(SubscriptionBalance)
        const accessRepository = manager.getRepository(VpnAccess)
        const accessOperationRepository = manager.getRepository(AccessOperationLog)
        const paymentRepository = manager.getRepository(Payment)
        const paymentAttemptRepository = manager.getRepository(PaymentAttempt)
        const paymentNotificationRepository = manager.getRepository(PaymentAdminNotification)
        const paymentWebhookRepository = manager.getRepository(PaymentWebhookEvent)
        const paymentMethodRepository = manager.getRepository(PaymentMethod)
        const plategaRecurrentRepository = manager.getRepository(PlategaRecurrentAgreement)
        const referralRepository = manager.getRepository(ReferralBonusLedger)
        const promoUsageRepository = manager.getRepository(PromoUsage)
        const supportMessageRepository = manager.getRepository(SupportMessage)
        const supportThreadRepository = manager.getRepository(SupportThread)
        const telegramAuthRepository = manager.getRepository(TelegramAuthRequest)
        const telegramLinkRepository = manager.getRepository(TelegramSiteLinkRequest)
        const attributionRepository = manager.getRepository(UserAttribution)
        const analyticsEventRepository = manager.getRepository(AnalyticsEvent)

        const lockedUser = await userRepository.findOne({
            where: { id: userId },
            lock: { mode: 'pessimistic_write' },
        })
        if (!lockedUser) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        const supportMediaKeys = new Set<string>()
        const supportPhotos = await supportMessageRepository.find({
            where: { userId, contentKind: SupportMessageContentKindEnum.PHOTO },
            select: { attachment: true } as any,
        })
        for (const message of supportPhotos) {
            const attachment = message.attachment as any
            if (attachment?.storageProvider === 'FILESYSTEM' && String(attachment.storageKey || '').trim()) {
                supportMediaKeys.add(String(attachment.storageKey).trim())
            }
        }

        const subscriptions = await subscriptionRepository.find({ where: { userId }, select: { id: true } })
        const subscriptionIds = subscriptions.map((subscription) => subscription.id)
        const accesses = await accessRepository.find({
            where: subscriptionIds.length ? [{ userId }, { subscriptionId: In(subscriptionIds) }] : { userId },
            select: { id: true },
        })
        const accessIds = accesses.map((access) => access.id)
        const payments = await paymentRepository.find({
            where: subscriptionIds.length ? [{ userId }, { subscriptionId: In(subscriptionIds) }] : { userId },
            select: { id: true, provider: true, providerPaymentId: true },
        })
        const paymentIds = payments.map((payment) => payment.id)
        const paymentMethods = await paymentMethodRepository.find({ where: { userId }, select: { id: true } })
        const paymentMethodIds = paymentMethods.map((method) => method.id)
        const recurrentAgreements = await plategaRecurrentRepository.find({
            where: subscriptionIds.length ? [{ userId }, { subscriptionId: In(subscriptionIds) }] : { userId },
            select: { id: true, providerSubscriptionId: true },
        })

        if (subscriptionIds.length) {
            await accessOperationRepository.delete({ subscriptionId: In(subscriptionIds) })
        }
        if (accessIds.length) {
            await accessOperationRepository.delete({ accessId: In(accessIds) })
        }
        await accessRepository.delete({ userId })
        if (subscriptionIds.length) {
            await accessRepository.delete({ subscriptionId: In(subscriptionIds) })
        }

        if (paymentIds.length) {
            await paymentAttemptRepository.delete({ paymentId: In(paymentIds) })
            await paymentNotificationRepository.delete({ paymentId: In(paymentIds) })
            await renewalRepository.update({ succeededPaymentId: In(paymentIds) }, { succeededPaymentId: null })
            await paymentRepository.update({ parentPaymentId: In(paymentIds) }, { parentPaymentId: null })
        }

        await referralRepository.delete({ referrerUserId: userId })
        await referralRepository.delete({ referredUserId: userId })
        if (subscriptionIds.length) {
            await referralRepository.delete({ subscriptionId: In(subscriptionIds) })
        }
        if (paymentIds.length) {
            await referralRepository.delete({ paymentId: In(paymentIds) })
        }

        const providerPayments = payments
            .filter((payment) => payment.providerPaymentId)
            .map((payment) => ({ provider: payment.provider, providerPaymentId: payment.providerPaymentId! }))
        for (const providerPayment of providerPayments) {
            await paymentWebhookRepository.delete({
                provider: ILike(providerPayment.provider),
                providerPaymentId: providerPayment.providerPaymentId,
            })
        }
        for (const agreement of recurrentAgreements) {
            if (agreement.providerSubscriptionId) {
                await paymentWebhookRepository.delete({
                    provider: 'platega-recurrent',
                    providerPaymentId: agreement.providerSubscriptionId,
                })
            }
        }

        await promoUsageRepository.delete({ userId })
        await supportMessageRepository.delete({ userId })
        await supportMessageRepository.update({ adminUserId: userId }, { adminUserId: null })
        await supportThreadRepository.delete({ userId })
        await telegramAuthRepository.delete({ userId })
        await telegramLinkRepository.delete({ linkedUserId: userId })
        if (lockedUser.telegramId) {
            await telegramLinkRepository.delete({ telegramId: lockedUser.telegramId })
        }
        await attributionRepository.delete({ userId })
        await analyticsEventRepository.delete({ userId })

        if (subscriptionIds.length) {
            await balanceRepository.delete({ subscriptionId: In(subscriptionIds) })
            await renewalRepository.delete({ subscriptionId: In(subscriptionIds) })
        }
        await plategaRecurrentRepository.delete({ userId })
        if (subscriptionIds.length) {
            await plategaRecurrentRepository.delete({ subscriptionId: In(subscriptionIds) })
        }
        if (paymentIds.length) {
            await paymentRepository.delete({ id: In(paymentIds) })
        }
        if (subscriptionIds.length) {
            await subscriptionRepository.delete({ id: In(subscriptionIds) })
        }
        if (paymentMethodIds.length) {
            await paymentRepository.update({ paymentMethodId: In(paymentMethodIds) }, { paymentMethodId: null })
            await renewalRepository.update({ paymentMethodId: In(paymentMethodIds) }, { paymentMethodId: null })
            await paymentMethodRepository.delete({ id: In(paymentMethodIds) })
        }

        await userRepository.update({ referredByUserId: userId }, { referredByUserId: null })
        await userRepository.delete(userId)
        return [...supportMediaKeys]
    }
}
