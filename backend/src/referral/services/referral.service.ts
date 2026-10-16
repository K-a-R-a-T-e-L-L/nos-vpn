import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, LessThanOrEqual, Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { AnalyticsService } from '../../analytics/services/analytics.service'
import { tgEmoji } from '../../bot/custom-emoji.registry'
import { NotificationService } from '../../notification/notification.service'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { User } from '../../system/user/entity/user.entity'
import { ReferralBonusLedger, ReferralRewardStatusEnum } from '../entity/referral-bonus-ledger.entity'
import { REFERRAL_REWARD_PERCENT, ReferralRewardCalculation } from '../utils/referral-reward-calculator'

type BonusBalanceMutationOptions = {
    notify?: boolean
    notificationText?: string | null
}

@Injectable()
export class ReferralService {
    private readonly logger = new Logger(ReferralService.name)

    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(ReferralBonusLedger)
        private readonly referralBonusRepository: Repository<ReferralBonusLedger>,
        private readonly analyticsService: AnalyticsService,
        private readonly notificationService: NotificationService,
        private readonly dataSource: DataSource,
    ) {}

    async attachReferrer(userId: string, referralCode: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        const referrer = await this.userRepository.findOne({ where: { referralCode } })
        if (!referrer) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Referrer not found')
        }

        if (referrer.id === user.id) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Self-referral is forbidden')
        }

        if (user.referredByUserId && user.referredByUserId !== referrer.id) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Referrer already set')
        }

        user.referredByUserId = referrer.id
        await this.userRepository.save(user)
        await this.analyticsService.trackReferralAttached(user.id, referralCode)
        return user
    }

    async getReferralStats(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        const invitedCount = await this.userRepository.count({ where: { referredByUserId: userId } })
        const invitedPaidCount = await this.userRepository
            .createQueryBuilder('user')
            .where('user.referredByUserId = :userId', { userId })
            .andWhere('user.firstPaidAt IS NOT NULL')
            .getCount()
        const activeInvitedCount = await this.userRepository
            .createQueryBuilder('user')
            .leftJoin('user.subscription', 'subscription')
            .where('user.referredByUserId = :userId', { userId })
            .andWhere('subscription.status IN (:...statuses)', {
                statuses: [StatusesEnum.ACTIVE, StatusesEnum.GRACE],
            })
            .getCount()

        return {
            referralCode: user.referralCode,
            telegramBotStartUrl: this.getTelegramBotStartUrl(),
            invitedCount,
            invitedPaidCount,
            activeInvitedCount,
            bonusBalanceRub: user.referralBonusBalanceRub || 0,
            totalBonusRub: user.totalReferralBonusRub || 0,
        }
    }

    async awardPaymentBonus(input: {
        userId: string
        subscriptionId?: string
        paymentId?: string
        amountRub: number
        paidAt?: Date
        rewardCalculation?: ReferralRewardCalculation
    }) {
        const paidAt = input.paidAt || new Date()
        const outcome = await this.dataSource.transaction(async (manager) => {
            const userRepository = manager.getRepository(User)
            const ledgerRepository = manager.getRepository(ReferralBonusLedger)
            const user = await userRepository.findOne({
                where: { id: input.userId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!user?.referredByUserId) return null

            if (input.paymentId) {
                const existing = await ledgerRepository.findOne({ where: { paymentId: input.paymentId } })
                if (existing) return { ledger: existing, created: false, referrer: null as User | null }
            }

            const referrer = await userRepository.findOne({
                where: { id: user.referredByUserId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!referrer) return null

            if (input.rewardCalculation?.status === 'PENDING') {
                const ledger = await ledgerRepository.save({
                    referrerUserId: user.referredByUserId,
                    referredUserId: input.userId,
                    subscriptionId: input.subscriptionId,
                    paymentId: input.paymentId,
                    bonusRub: 0,
                    bonusPercent: input.rewardCalculation.rewardPercent,
                    grossAmountRub: Number(input.rewardCalculation.grossAmountRub),
                    paymentMethodType: input.rewardCalculation.paymentMethodType,
                    calculationVersion: input.rewardCalculation.calculationVersion,
                    calculationErrorCode: input.rewardCalculation.errorCode,
                    eligibleAt: paidAt,
                    status: ReferralRewardStatusEnum.CALCULATION_PENDING,
                })
                return { ledger, created: true, referrer: null as User | null }
            }

            const calculation = input.rewardCalculation?.status === 'CALCULATED' ? input.rewardCalculation : null
            const bonusRub = calculation
                ? Number(calculation.rewardAmountRub)
                : this.calculatePaymentBonus(input.amountRub)
            if (bonusRub <= 0) return null

            referrer.referralBonusBalanceRub = this.roundMoney((referrer.referralBonusBalanceRub || 0) + bonusRub)
            referrer.totalReferralBonusRub = this.roundMoney((referrer.totalReferralBonusRub || 0) + bonusRub)
            const updatedReferrer = await userRepository.save(referrer)

            const ledger = await ledgerRepository.save({
                referrerUserId: user.referredByUserId,
                referredUserId: input.userId,
                subscriptionId: input.subscriptionId,
                paymentId: input.paymentId,
                bonusRub,
                bonusPercent: calculation?.rewardPercent || REFERRAL_REWARD_PERCENT,
                grossAmountRub: calculation ? Number(calculation.grossAmountRub) : null,
                taxAmountRub: calculation ? Number(calculation.taxAmountRub) : null,
                providerIncomeAmountRub:
                    calculation?.providerIncomeAmountRub === null || !calculation
                        ? null
                        : Number(calculation.providerIncomeAmountRub),
                providerFeeAmountRub: calculation ? Number(calculation.providerFeeAmountRub) : null,
                netReferralBaseRub: calculation ? Number(calculation.netReferralBaseRub) : null,
                paymentMethodType: calculation?.paymentMethodType || null,
                calculationVersion: calculation?.calculationVersion || null,
                calculationErrorCode: null,
                eligibleAt: paidAt,
                awardedAt: paidAt,
                status: ReferralRewardStatusEnum.AWARDED,
            })
            return { ledger, created: true, referrer: updatedReferrer }
        })

        if (!outcome) return null
        if (!outcome.created) return outcome.ledger

        await this.analyticsService.trackReferralFriendPaid({
            referredUserId: input.userId,
            referrerUserId: outcome.ledger.referrerUserId,
            amountRub: input.amountRub,
            paidAt,
        })

        if (outcome.ledger.status === ReferralRewardStatusEnum.CALCULATION_PENDING) {
            this.logger.warn(
                `Referral calculation pending code=${outcome.ledger.calculationErrorCode || 'unknown'} method=${outcome.ledger.paymentMethodType || 'unknown'} payment=${input.paymentId || 'none'}`,
            )
            return outcome.ledger
        }

        await this.safeNotifyWalletChange(
            outcome.referrer!,
            [
                `${tgEmoji('WALLET_BONUS')} Вам начислен бонус ${this.formatMoney(outcome.ledger.bonusRub)} ₽ за оплату подписки вашим другом.`,
                '',
                `Баланс кошелька: ${this.formatMoney(outcome.referrer!.referralBonusBalanceRub || 0)} ₽.`,
            ].join('\n'),
        )

        return outcome.ledger
    }

    async redeemFullPayment(userId: string, amountRub: number, options: BonusBalanceMutationOptions = {}) {
        const amount = this.roundMoney(amountRub)
        if (amount <= 0) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Bonus payment amount is invalid')
        }

        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        const currentBalance = this.roundMoney(user.referralBonusBalanceRub || 0)
        if (currentBalance < amount) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Insufficient bonus balance')
        }

        const updatedUser = await this.decreaseBonusBalance(user, amount, options)

        return {
            redeemedRub: amount,
            balanceRub: updatedUser.referralBonusBalanceRub,
        }
    }

    async refundBonusPayment(userId: string, amountRub: number, options: BonusBalanceMutationOptions = {}) {
        const amount = this.roundMoney(amountRub)
        if (amount <= 0) {
            return null
        }

        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user) {
            return null
        }

        return this.increaseBonusBalance(user, amount, options)
    }

    async createPendingBonusForFirstPayment(userId: string, subscriptionId?: string, paidAt = new Date()) {
        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user?.referredByUserId) {
            return null
        }

        const existing = await this.referralBonusRepository.findOne({ where: { referredUserId: userId } })
        if (existing) {
            return existing
        }

        const eligibleAt = new Date(paidAt)
        eligibleAt.setDate(eligibleAt.getDate() + 3)

        return this.referralBonusRepository.save({
            referrerUserId: user.referredByUserId,
            referredUserId: userId,
            subscriptionId,
            bonusRub: 0,
            bonusPercent: REFERRAL_REWARD_PERCENT,
            eligibleAt,
            status: ReferralRewardStatusEnum.PENDING_WINDOW,
        })
    }

    async awardEligibleBonuses(now = new Date()) {
        const pending = await this.referralBonusRepository.find({
            where: {
                status: ReferralRewardStatusEnum.PENDING_WINDOW,
                eligibleAt: LessThanOrEqual(now),
            },
        })

        for (const item of pending) {
            const referrer = await this.userRepository.findOne({ where: { id: item.referrerUserId } })
            if (!referrer) {
                item.status = ReferralRewardStatusEnum.REJECTED
                await this.referralBonusRepository.save(item)
                continue
            }

            const addRub = item.bonusRub || 0
            const updatedReferrer = await this.increaseBonusBalance(referrer, addRub, { notify: false })
            updatedReferrer.totalReferralBonusRub = this.roundMoney(
                (updatedReferrer.totalReferralBonusRub || 0) + addRub,
            )
            await this.userRepository.save(updatedReferrer)

            item.status = ReferralRewardStatusEnum.AWARDED
            item.awardedAt = now
            await this.referralBonusRepository.save(item)

            if (addRub > 0) {
                await this.safeNotifyWalletChange(updatedReferrer)
            }
        }

        return pending.length
    }

    private calculatePaymentBonus(amountRub: number) {
        return this.roundMoney((Number(amountRub) || 0) * (REFERRAL_REWARD_PERCENT / 100))
    }

    private async increaseBonusBalance(user: User, amountRub: number, options: BonusBalanceMutationOptions = {}) {
        user.referralBonusBalanceRub = this.roundMoney((user.referralBonusBalanceRub || 0) + amountRub)
        const saved = await this.userRepository.save(user)
        await this.notifyWalletChange(saved, options)
        return saved
    }

    private async decreaseBonusBalance(user: User, amountRub: number, options: BonusBalanceMutationOptions = {}) {
        user.referralBonusBalanceRub = this.roundMoney((user.referralBonusBalanceRub || 0) - amountRub)
        const saved = await this.userRepository.save(user)
        await this.notifyWalletChange(saved, options)
        return saved
    }

    private async notifyWalletChange(user: User, options: BonusBalanceMutationOptions = {}) {
        if (options.notify === false || !user.telegramId) {
            return
        }

        const text =
            options.notificationText ||
            [
                `${tgEmoji('WALLET_CHANGED')} Ваш баланс изменился`,
                '',
                `Теперь он составляет ${this.formatMoney(user.referralBonusBalanceRub || 0)} ₽.`,
            ].join('\n')

        await this.notificationService.notify(user.telegramId, text, { parse_mode: 'HTML' })
    }

    private async safeNotifyWalletChange(user: User, notificationText?: string | null) {
        try {
            await this.notifyWalletChange(user, { notificationText })
        } catch (error: any) {
            this.logger.warn(`Wallet change notification failed for user=${user.id}: ${error?.message || 'unknown'}`)
        }
    }

    private roundMoney(value: number) {
        return Math.round((Number(value) || 0) * 100) / 100
    }

    private formatMoney(value: number) {
        return Number(value || 0).toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })
    }

    private getTelegramBotStartUrl() {
        const configured = String(this.configService.get<string>('TELEGRAM_BOT_START_URL') || '').trim()
        if (configured) {
            return configured.replace(/\?start=.*$/, '').replace(/\/$/, '') + '?start='
        }

        const username = String(this.configService.get<string>('TELEGRAM_BOT_USERNAME') || '')
            .trim()
            .replace(/^@/, '')
        if (!username) {
            return null
        }

        return `https://t.me/${username}?start=`
    }
}
