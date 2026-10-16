import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { getAdminUserDetails, queryAdminUsers } from './admin-user-analytics.queries'
import { tgEmoji } from '../../../bot/custom-emoji.registry'
import { NotificationService } from '../../../notification/notification.service'
import { Plan } from '../../../plan/entity/plan.entity'
import { PromoCode } from '../../../promo/entity/promo-code.entity'
import { PromoStatusEnum } from '../../../promo/entity/promo.enum'
import { Subscription } from '../../../subscription/entity/subscription.entity'
import { StatusesEnum } from '../../../subscription/enum/statuses.enum'
import { SubscriptionService } from '../../../subscription/services/subscription.service'
import { SupportThread } from '../../../support/entity/support-thread.entity'
import { SupportThreadStatusEnum } from '../../../support/entity/support.enum'
import { VpnAccessService } from '../../../vpn-access/services/vpn-access.service'
import { AdminUserQueryDto } from '../dto/admin-user-query.dto'
import { User } from '../entity/user.entity'

@Injectable()
export class UserAdminService {
    private readonly logger = new Logger('UserService')
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(Subscription) private readonly subscriptionRepository: Repository<Subscription>,
        @InjectRepository(Plan) private readonly planRepository: Repository<Plan>,
        @InjectRepository(PromoCode) private readonly promoCodeRepository: Repository<PromoCode>,
        @InjectRepository(SupportThread) private readonly supportThreadRepository: Repository<SupportThread>,
        private readonly vpnAccessService: VpnAccessService,
        private readonly notificationService: NotificationService,
        private readonly subscriptionService: SubscriptionService,
    ) {}

    async findBroadcastRecipients() {
        return this.userRepository
            .createQueryBuilder('user')
            .where('user.telegramId IS NOT NULL')
            .orderBy('user.createdAt', 'ASC')
            .getMany()
    }

    async findAdminUsers(search?: string, page = 1, pageSize = 25) {
        const safePage = Math.max(1, Number(page) || 1)
        const safePageSize = Math.min(100, Math.max(10, Number(pageSize) || 25))
        const query = this.userRepository
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.subscription', 'subscription')
            .leftJoinAndSelect('subscription.plan', 'plan')
            .orderBy('user.createdAt', 'DESC')

        const normalizedSearch = String(search || '').trim()
        if (normalizedSearch) {
            query.andWhere(
                [
                    'LOWER(user.email) LIKE LOWER(:search)',
                    'LOWER(user.telegramUsername) LIKE LOWER(:search)',
                    'CAST(user.telegramId AS TEXT) LIKE :plainSearch',
                    'CAST(user.id AS TEXT) LIKE :plainSearch',
                ].join(' OR '),
                {
                    search: `%${normalizedSearch}%`,
                    plainSearch: `%${normalizedSearch}%`,
                },
            )
        }

        const total = await query.getCount()
        query.skip((safePage - 1) * safePageSize).take(safePageSize)

        const users = await query.getMany()
        const items = await Promise.all(
            users.map(async (user) => {
                if (!user.subscription?.id) {
                    return user
                }

                const access = await this.vpnAccessService.findActiveBySubscription(user.subscription.id)
                return {
                    ...user,
                    access: access
                        ? {
                              id: access.id,
                              status: access.status,
                              subscriptionUrl: access.subscriptionUrl,
                              qrPayload: access.qrPayload,
                              providerClientKey: access.providerClientKey,
                              providerExternalId: access.providerExternalId,
                              serverNodeId: access.serverNodeId,
                              lastSyncedAt: access.lastSyncedAt,
                          }
                        : null,
                }
            }),
        )

        return {
            items,
            total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.max(1, Math.ceil(total / safePageSize)),
        }
    }

    async queryAdminUsers(dto: AdminUserQueryDto) {
        return queryAdminUsers(this.userRepository, dto)
    }

    async getAdminUserDetails(userId: string, paymentPage = 1, paymentPageSize = 25) {
        return getAdminUserDetails(this.userRepository, userId, paymentPage, paymentPageSize)
    }

    async updateReferralWalletBalance(userId: string, balanceRub: number) {
        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        const nextBalance = this.roundMoney(balanceRub)
        const previousBalance = this.roundMoney(user.referralBonusBalanceRub || 0)
        user.referralBonusBalanceRub = nextBalance
        const saved = await this.userRepository.save(user)

        if (saved.telegramId && previousBalance !== nextBalance) {
            try {
                await this.notificationService.notify(
                    saved.telegramId,
                    [
                        `${tgEmoji('WALLET_CHANGED')} Ваш баланс изменился`,
                        '',
                        `Теперь он составляет ${this.formatMoney(saved.referralBonusBalanceRub || 0)} ₽.`,
                    ].join('\n'),
                    { parse_mode: 'HTML' },
                )
            } catch (error) {
                this.logger.warn(
                    `Wallet balance notification failed for user=${saved.id}: ${error instanceof Error ? error.message : 'unknown'}`,
                )
            }
        }

        return saved
    }

    async setBlocked(userId: string, isBlocked: boolean) {
        const user = await this.userRepository.findOne({ where: { id: userId }, relations: { subscription: true } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        user.isBlocked = isBlocked
        user.blockedAt = isBlocked ? new Date() : null
        const saved = await this.userRepository.save(user)

        if (isBlocked && user.subscription?.id) {
            const current = await this.subscriptionService.getResolvedById(user.subscription.id)
            if (current && [StatusesEnum.ACTIVE, StatusesEnum.GRACE, StatusesEnum.PENDING].includes(current.status)) {
                await this.subscriptionService.stopSubscription(user.id).catch(() => null)
            }
        }

        return saved
    }

    async getAdminSummary() {
        const now = new Date()
        const [totalUsers, activeSubscriptions, activePlans, openSupportThreads, activePromos] = await Promise.all([
            this.userRepository.count(),
            this.subscriptionRepository.count({ where: { status: StatusesEnum.ACTIVE } }),
            this.planRepository.count({ where: { isActive: true } }),
            this.supportThreadRepository.count({ where: { status: SupportThreadStatusEnum.OPEN } }),
            this.promoCodeRepository
                .createQueryBuilder('promo')
                .where('promo.status = :status', { status: PromoStatusEnum.ACTIVE })
                .andWhere('(promo.startsAt IS NULL OR promo.startsAt <= :now)', { now })
                .andWhere('(promo.expiresAt IS NULL OR promo.expiresAt > :now)', { now })
                .getCount(),
        ])

        return {
            totalUsers,
            activeSubscriptions,
            activePlans,
            activePromos,
            openSupportThreads,
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
}
