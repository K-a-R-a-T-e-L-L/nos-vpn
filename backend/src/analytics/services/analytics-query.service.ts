import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { normalizeAnalyticsSourceCode, roundAnalyticsMoney } from './analytics-mapper'
import { Payment } from '../../payment/entity/payment.entity'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'
import { Plan } from '../../plan/entity/plan.entity'
import { ReferralBonusLedger } from '../../referral/entity/referral-bonus-ledger.entity'
import { User } from '../../system/user/entity/user.entity'
import { CreateTrafficSourceDto } from '../dto/create-traffic-source.dto'
import { UpdateTrafficSourceDto } from '../dto/update-traffic-source.dto'
import { TrafficSource } from '../entity/traffic-source.entity'
import { UserAttribution } from '../entity/user-attribution.entity'

@Injectable()
export class AnalyticsQueryService {
    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(TrafficSource)
        private readonly trafficSourceRepository: Repository<TrafficSource>,
        @InjectRepository(UserAttribution)
        private readonly userAttributionRepository: Repository<UserAttribution>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Payment)
        private readonly paymentRepository: Repository<Payment>,
        @InjectRepository(Plan)
        private readonly planRepository: Repository<Plan>,
        @InjectRepository(ReferralBonusLedger)
        private readonly referralBonusRepository: Repository<ReferralBonusLedger>,
    ) {}

    async createSource(dto: CreateTrafficSourceDto) {
        const code = normalizeAnalyticsSourceCode(dto.code)
        if (!code || !String(dto.name || '').trim()) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Traffic source code and name are required')
        }
        const existing = await this.trafficSourceRepository.findOne({ where: { code } })
        if (existing) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Traffic source already exists')
        }

        return this.trafficSourceRepository.save({
            code,
            name: String(dto.name || '').trim(),
            description: dto.description?.trim() || null,
            websitePath: dto.websitePath?.trim() || '/earn',
            isActive: dto.isActive !== false,
        })
    }

    async updateSource(id: string, dto: UpdateTrafficSourceDto) {
        const source = await this.trafficSourceRepository.findOne({ where: { id } })
        if (!source) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Traffic source not found')
        }

        if (dto.code) {
            const normalizedCode = normalizeAnalyticsSourceCode(dto.code)
            if (!normalizedCode) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Traffic source code is required')
            }
            const existing = await this.trafficSourceRepository.findOne({ where: { code: normalizedCode } })
            if (existing && existing.id !== source.id) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Traffic source code already exists')
            }
            source.code = normalizedCode
        }

        if (dto.name !== undefined) {
            source.name = String(dto.name || '').trim()
        }
        if (dto.description !== undefined) {
            source.description = dto.description?.trim() || null
        }
        if (dto.websitePath !== undefined) {
            source.websitePath = dto.websitePath?.trim() || '/earn'
        }
        if (dto.isActive !== undefined) {
            source.isActive = dto.isActive
        }

        return this.trafficSourceRepository.save(source)
    }

    async deleteSource(id: string) {
        const source = await this.trafficSourceRepository.findOne({ where: { id } })
        if (!source) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Traffic source not found')
        }

        await this.trafficSourceRepository.remove(source)
        return { ok: true, id }
    }

    async getOverview() {
        const [totalUsers, totalSources, totalAttributions] = await Promise.all([
            this.userRepository.count(),
            this.trafficSourceRepository.count(),
            this.userAttributionRepository.count(),
        ])

        const attributions = await this.userAttributionRepository.find()
        const succeededPayments = await this.paymentRepository.find({
            where: { status: PaymentStatusEnum.SUCCEEDED },
        })
        const paymentByUser = new Map<string, Payment[]>()
        for (const payment of succeededPayments) {
            if (!payment.userId) {
                continue
            }
            const items = paymentByUser.get(payment.userId) || []
            items.push(payment)
            paymentByUser.set(payment.userId, items)
        }

        const totalRevenueRub = roundAnalyticsMoney(
            succeededPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
        )

        const invitedUsers = await this.userRepository
            .createQueryBuilder('user')
            .where('user.referredByUserId IS NOT NULL')
            .getCount()

        return {
            totalUsers,
            totalSources,
            totalAttributions,
            botStarts: attributions.filter((item) => item.botStartedAt).length,
            trialsStarted: attributions.filter((item) => item.trialStartedAt).length,
            accessViewed: attributions.filter((item) => item.accessViewedAt).length,
            qrOpened: attributions.filter((item) => item.qrOpenedAt).length,
            firstPayments: attributions.filter((item) => item.firstPaymentAt).length,
            paidAfterTrial: attributions.filter((item) => item.firstPostTrialPaymentAt).length,
            invitedUsers,
            referralPaidCount: await this.referralBonusRepository.count(),
            totalRevenueRub,
            attributedRevenueRub: roundAnalyticsMoney(
                attributions.reduce((sum, item) => {
                    const payments = paymentByUser.get(item.userId) || []
                    return sum + payments.reduce((inner, payment) => inner + (Number(payment.amount) || 0), 0)
                }, 0),
            ),
        }
    }

    async listSourcesWithMetrics(page = 1, pageSize = 20) {
        const safePage = Math.max(1, Number(page) || 1)
        const safePageSize = Math.min(100, Math.max(10, Number(pageSize) || 20))
        const [sources, total, attributions, payments, plans] = await Promise.all([
            this.trafficSourceRepository.find({
                order: { createdAt: 'DESC' },
                skip: (safePage - 1) * safePageSize,
                take: safePageSize,
            }),
            this.trafficSourceRepository.count(),
            this.userAttributionRepository.find({ order: { createdAt: 'DESC' } }),
            this.paymentRepository.find({ where: { status: PaymentStatusEnum.SUCCEEDED } }),
            this.planRepository.find(),
        ])
        const planMap = new Map(plans.map((plan) => [plan.id, plan]))

        const items = sources.map((source) => {
            const sourceAttributions = attributions.filter((item) => item.sourceId === source.id)
            const sourceUserIds = new Set(sourceAttributions.map((item) => item.userId))
            const sourcePayments = payments.filter((payment) => payment.userId && sourceUserIds.has(payment.userId))
            const latestPlanIds = sourceAttributions.map((item) => item.latestPlanId).filter(Boolean) as string[]
            const latestPlanTitles = latestPlanIds
                .map((planId) => planMap.get(planId))
                .filter(Boolean)
                .map((plan) => plan?.title || plan?.name || plan?.code)

            return {
                ...source,
                websiteUrl: this.buildWebsiteUrl(source),
                botStartUrl: this.buildBotStartUrl(source),
                metrics: {
                    attributedUsers: sourceAttributions.length,
                    botStarts: sourceAttributions.filter((item) => item.botStartedAt).length,
                    trialsStarted: sourceAttributions.filter((item) => item.trialStartedAt).length,
                    accessViewed: sourceAttributions.filter((item) => item.accessViewedAt).length,
                    qrOpened: sourceAttributions.filter((item) => item.qrOpenedAt).length,
                    firstPayments: sourceAttributions.filter((item) => item.firstPaymentAt).length,
                    paidAfterTrial: sourceAttributions.filter((item) => item.firstPostTrialPaymentAt).length,
                    totalRevenueRub: roundAnalyticsMoney(
                        sourcePayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
                    ),
                    paymentsCount: sourcePayments.length,
                    latestPlans: Array.from(new Set(latestPlanTitles)).filter(Boolean),
                },
            }
        })

        return {
            items,
            total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.max(1, Math.ceil(total / safePageSize)),
        }
    }

    async listAttributedUsers(search?: string, page = 1, pageSize = 25) {
        const items = await this.userAttributionRepository.find({
            relations: { user: true, source: true },
            order: { createdAt: 'DESC' },
        })
        const payments = await this.paymentRepository.find({ where: { status: PaymentStatusEnum.SUCCEEDED } })
        const plans = await this.planRepository.find()
        const planMap = new Map(plans.map((plan) => [plan.id, plan]))
        const normalizedSearch = String(search || '')
            .trim()
            .toLowerCase()

        const filtered = items
            .map((item) => {
                const userPayments = payments.filter((payment) => payment.userId === item.userId)
                const totalPaidRub = roundAnalyticsMoney(
                    userPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
                )
                const latestPlan = item.latestPlanId ? planMap.get(item.latestPlanId) : null
                return {
                    id: item.id,
                    userId: item.userId,
                    user: {
                        email: item.user?.email || null,
                        telegramId: item.user?.telegramId || null,
                        telegramUsername: item.user?.telegramUsername || null,
                    },
                    source: item.source
                        ? {
                              id: item.source.id,
                              code: item.source.code,
                              name: item.source.name,
                          }
                        : null,
                    entryPoint: item.entryPoint,
                    landingPath: item.landingPath,
                    botStartedAt: item.botStartedAt,
                    trialStartedAt: item.trialStartedAt,
                    accessViewedAt: item.accessViewedAt,
                    qrOpenedAt: item.qrOpenedAt,
                    firstPaymentAt: item.firstPaymentAt,
                    firstPostTrialPaymentAt: item.firstPostTrialPaymentAt,
                    latestPlan: latestPlan
                        ? {
                              id: latestPlan.id,
                              code: latestPlan.code,
                              title: latestPlan.title || latestPlan.name,
                          }
                        : null,
                    totalPaidRub,
                }
            })
            .filter((item) => {
                if (!normalizedSearch) {
                    return true
                }
                return [
                    item.userId,
                    item.user.email || '',
                    item.user.telegramUsername || '',
                    String(item.user.telegramId || ''),
                    item.source?.code || '',
                    item.source?.name || '',
                ]
                    .join(' ')
                    .toLowerCase()
                    .includes(normalizedSearch)
            })

        const safePage = Math.max(1, Number(page) || 1)
        const safePageSize = Math.min(100, Math.max(10, Number(pageSize) || 25))
        const total = filtered.length
        const pagedItems = filtered.slice((safePage - 1) * safePageSize, safePage * safePageSize)

        return {
            items: pagedItems,
            total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.max(1, Math.ceil(total / safePageSize)),
        }
    }

    private buildBotStartUrl(source: TrafficSource) {
        const configured = String(this.configService.get<string>('TELEGRAM_BOT_START_URL') || '').trim()
        if (configured) {
            return configured.replace(/\?start=.*$/, '').replace(/\/$/, '') + `?start=src_${source.code}`
        }

        const username = String(this.configService.get<string>('TELEGRAM_BOT_USERNAME') || '')
            .trim()
            .replace(/^@/, '')
        if (!username) {
            return null
        }

        return `https://t.me/${username}?start=src_${source.code}`
    }

    private buildWebsiteUrl(source: TrafficSource) {
        const frontendOrigin = String(this.configService.get<string>('FRONTEND_ORIGIN') || '')
            .trim()
            .replace(/\/$/, '')
        if (!frontendOrigin) {
            return null
        }

        const websitePath = source.websitePath?.startsWith('/')
            ? source.websitePath
            : `/${source.websitePath || 'earn'}`
        return `${frontendOrigin}${websitePath}?src=${encodeURIComponent(source.code)}`
    }
}
