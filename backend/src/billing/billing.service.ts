import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { Meter } from './entities/meter.entity'
import { PlanLimit } from './entities/plan-limit.entity'
import { SubscriptionBalance } from './entities/subscription-balance.entity'
import { UsageEvent } from './entities/usage-event.entity'
import { UsageLineItem } from './entities/usage-line-item.entity'
import { Plan } from '../plan/entity/plan.entity'
import { Subscription } from '../subscription/entity/subscription.entity'

type UsageLineItemInput = {
    meterCode: string
    qty: number
}

@Injectable()
export class BillingService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        @InjectRepository(Plan)
        private readonly planRepository: Repository<Plan>,
        @InjectRepository(Meter)
        private readonly meterRepository: Repository<Meter>,
        @InjectRepository(PlanLimit)
        private readonly planLimitRepository: Repository<PlanLimit>,
        @InjectRepository(SubscriptionBalance)
        private readonly subscriptionBalanceRepository: Repository<SubscriptionBalance>,
        @InjectRepository(UsageEvent)
        private readonly usageEventRepository: Repository<UsageEvent>,
        @InjectRepository(UsageLineItem)
        private readonly usageLineItemRepository: Repository<UsageLineItem>,
    ) {}

    async getActiveSubscription(userId: string) {
        const subscription = await this.subscriptionRepository.findOne({
            where: { userId, status: 'ACTIVE' as any },
            relations: { plan: true },
        })

        if (!subscription) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Active subscription required')
        }

        return subscription
    }

    private buildPeriod(plan: Plan) {
        const periodStart = new Date()
        const periodEnd = new Date()
        periodEnd.setDate(periodEnd.getDate() + (plan?.period ?? 30))

        return { periodStart, periodEnd }
    }

    async ensureBalances(subscription: Subscription) {
        const now = new Date()
        const planLimits = await this.planLimitRepository.find({
            where: { planId: subscription.planId },
        })

        if (planLimits.length === 0) {
            return []
        }

        const existing = await this.subscriptionBalanceRepository.find({
            where: {
                subscriptionId: subscription.id,
            },
        })

        const inPeriod = existing.filter(
            (b) => b.periodStart <= now && b.periodEnd >= now,
        )

        if (inPeriod.length > 0) {
            const existingMeterIds = new Set(inPeriod.map((b) => b.meterId))
            const missingLimits = planLimits.filter((limit) => !existingMeterIds.has(limit.meterId))

            if (missingLimits.length === 0) {
                return inPeriod
            }

            const periodStart = inPeriod[0].periodStart
            const periodEnd = inPeriod[0].periodEnd
            const createdMissing = await this.subscriptionBalanceRepository.save(
                missingLimits.map((limit) => ({
                    subscriptionId: subscription.id,
                    meterId: limit.meterId,
                    usedUnits: 0,
                    includedUnits: limit.includedUnits,
                    periodStart,
                    periodEnd,
                })),
            )

            return [...inPeriod, ...createdMissing]
        }

        const { periodStart, periodEnd } = this.buildPeriod(subscription.plan)

        const created = await this.subscriptionBalanceRepository.save(
            planLimits.map((limit) => ({
                subscriptionId: subscription.id,
                meterId: limit.meterId,
                usedUnits: 0,
                includedUnits: limit.includedUnits,
                periodStart,
                periodEnd,
            })),
        )

        return created
    }

    async getPlanLimitUnits(planId: string, meterCode: string) {
        const limit = await this.planLimitRepository
            .createQueryBuilder('planLimit')
            .innerJoin('planLimit.meter', 'meter')
            .where('planLimit.planId = :planId', { planId })
            .andWhere('meter.code = :meterCode', { meterCode })
            .getOne()

        return limit?.includedUnits ?? null
    }

    async canRun(
        userId: string,
        requiredMeters?: string[],
        maxUnitsPerRun?: Record<string, number>,
    ) {
        const subscription = await this.getActiveSubscription(userId)
        const balances = await this.ensureBalances(subscription)

        if (!requiredMeters?.length) {
            return { subscription, balances }
        }

        for (const meterCode of requiredMeters) {
            const meter = await this.meterRepository.findOne({ where: { code: meterCode } })
            if (!meter) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, `Meter not found: ${meterCode}`)
            }

            const balance = balances.find((b) => b.meterId === meter.id)
            if (!balance) {
                throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, `No balance for meter: ${meterCode}`)
            }

            const maxUnits = maxUnitsPerRun?.[meterCode]
            if (typeof maxUnits === 'number') {
                const remaining = balance.includedUnits - balance.usedUnits
                if (remaining < maxUnits) {
                    throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, `Insufficient balance for ${meterCode}`)
                }
            }
        }

        return { subscription, balances }
    }

    async recordUsage(
        userId: string,
        runLogId: string | undefined,
        lineItems: UsageLineItemInput[],
        idempotencyKey?: string,
        rawPayload?: Record<string, any>,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const usageEventRepo = manager.getRepository(UsageEvent)
            const usageLineItemRepo = manager.getRepository(UsageLineItem)
            const subscriptionBalanceRepo = manager.getRepository(SubscriptionBalance)
            const meterRepo = manager.getRepository(Meter)

            if (idempotencyKey) {
                const existing = await usageEventRepo.findOne({ where: { idempotencyKey } })
                if (existing) {
                    return existing
                }
            }

            const subscription = await this.getActiveSubscription(userId)
            const balances = await this.ensureBalances(subscription)

            const usageEvent = await usageEventRepo.save({
                runLogId: runLogId || null,
                idempotencyKey,
                rawPayload,
            })

            for (const item of lineItems) {
                const meter = await meterRepo.findOne({ where: { code: item.meterCode } })
                if (!meter) {
                    throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, `Meter not found: ${item.meterCode}`)
                }

                await usageLineItemRepo.save({
                    usageEventId: usageEvent.id,
                    meterId: meter.id,
                    qty: item.qty,
                })

                const balance = balances.find((b) => b.meterId === meter.id)
                if (!balance) {
                    throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, `No balance for meter: ${item.meterCode}`)
                }

                balance.usedUnits += item.qty
                await subscriptionBalanceRepo.save(balance)
            }

            return usageEvent
        })
    }
}
