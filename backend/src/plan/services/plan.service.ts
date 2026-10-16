import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseService } from '@common/database/base/base.service'

import { Meter } from '../../billing/entities/meter.entity'
import { PlanLimit } from '../../billing/entities/plan-limit.entity'
import { CreatePlanDto } from '../dto/create-plan.dto'
import { UpdatePlanDto } from '../dto/update-plan.dto'
import { Plan } from '../entity/plan.entity'
import {
    PLAN_DEVICE_LIMITS,
    PLAN_PERIOD_DAYS,
    buildPeriodLabel,
    buildPlanCode,
    buildPlanDescription,
    buildPlanTitle,
    buildSavingsPercent,
    daysToMonths,
    pluralizeDevices,
    resolveLegacyDevicesLimit,
} from '../plan.defaults'

const VPN_DEVICE_SLOTS_METER_CODE = 'vpn_device_slots'

export type PlanCatalogCell = {
    id: string
    code?: string | null
    title?: string | null
    name: string
    description?: string | null
    period: number
    amount: number
    isActive: boolean
    devicesLimit: number
    savingsPercent: number | null
}

export type PlanCatalogDuration = {
    periodDays: number
    months: number
    label: string
    startingPriceRub: number
    savingsPercent: number | null
}

export type PlanCatalogRow = {
    devicesLimit: number
    devicesLabel: string
    plans: Array<PlanCatalogCell | null>
}

export type PlanCatalogResponse = {
    durations: PlanCatalogDuration[]
    rows: PlanCatalogRow[]
}

@Injectable()
export class PlanService extends BaseService<Plan, CreatePlanDto, UpdatePlanDto> {
    constructor(
        @InjectRepository(Plan) private readonly planRepository: Repository<Plan>,
        @InjectRepository(Meter) private readonly meterRepository: Repository<Meter>,
        @InjectRepository(PlanLimit) private readonly planLimitRepository: Repository<PlanLimit>,
    ) {
        super(planRepository)
    }

    async findAllOrdered() {
        const plans = await this.planRepository.find({
            order: { period: 'ASC', amount: 'ASC', createdAt: 'ASC' },
            withDeleted: false,
        })

        return this.attachDeviceLimits(plans)
    }

    async findActiveOrderedByAmount() {
        const plans = await this.planRepository.find({
            where: { isActive: true },
            order: { period: 'ASC', amount: 'ASC', createdAt: 'ASC' },
        })

        return this.attachDeviceLimits(plans)
    }

    async findActiveByPeriod(period: number) {
        const plans = await this.planRepository.find({
            where: { isActive: true, period },
            order: { amount: 'ASC', createdAt: 'ASC' },
        })

        return this.attachDeviceLimits(plans)
    }

    async findActiveByPeriodAndDevices(period: number, devicesLimit: number) {
        const plans = await this.findActiveByPeriod(period)
        return plans.find((plan) => Number(plan.devicesLimit || 0) === Number(devicesLimit)) || null
    }

    async getPublicCatalog(): Promise<PlanCatalogResponse> {
        const plans = await this.findActiveOrderedByAmount()
        return this.buildCatalog(plans)
    }

    async getAdminCatalog(): Promise<PlanCatalogResponse> {
        const plans = await this.findAllOrdered()
        return this.buildCatalog(plans, true)
    }

    async createAdminPlan(dto: CreatePlanDto) {
        const devicesLimit = Math.max(1, Number(dto.devicesLimit) || 1)
        const period = Math.max(1, Number(dto.period) || 30)
        const title = String(dto.title || dto.name || '').trim() || buildPlanTitle(devicesLimit, period)
        const name = String(dto.name || title).trim()

        const plan = await this.planRepository.save(
            this.planRepository.create({
                code: dto.code?.trim() || buildPlanCode(period, devicesLimit),
                title,
                description: dto.description?.trim() || buildPlanDescription(devicesLimit),
                name,
                period,
                amount: Number(dto.amount) || 0,
                isActive: dto.isActive ?? true,
                devicesLimit,
            }),
        )

        await this.upsertDeviceLimit(plan.id, devicesLimit)
        return this.attachDeviceLimit(plan)
    }

    async updateAdminPlan(id: string, dto: UpdatePlanDto) {
        const plan = await this.planRepository.findOne({ where: { id } })
        if (!plan) {
            return null
        }

        const nextDevicesLimit =
            dto.devicesLimit !== undefined ? Math.max(1, Number(dto.devicesLimit) || 1) : Number(plan.devicesLimit || 1)
        const nextPeriod = dto.period !== undefined ? Math.max(1, Number(dto.period) || 1) : plan.period

        if (dto.code !== undefined) {
            plan.code = dto.code?.trim() || buildPlanCode(nextPeriod, nextDevicesLimit)
        }
        if (dto.title !== undefined) {
            plan.title = String(dto.title || '').trim() || buildPlanTitle(nextDevicesLimit, nextPeriod)
        }
        if (dto.name !== undefined) {
            plan.name = String(dto.name || '').trim() || plan.title || buildPlanTitle(nextDevicesLimit, nextPeriod)
        }
        if (dto.description !== undefined) {
            plan.description = dto.description?.trim() || buildPlanDescription(nextDevicesLimit)
        }
        if (dto.period !== undefined) {
            plan.period = nextPeriod
        }
        if (dto.amount !== undefined) {
            plan.amount = Number(dto.amount) || 0
        }
        if (dto.isActive !== undefined) {
            plan.isActive = dto.isActive
        }
        if (dto.devicesLimit !== undefined) {
            plan.devicesLimit = nextDevicesLimit
        }

        if (!plan.devicesLimit) {
            plan.devicesLimit = nextDevicesLimit
        }
        if (!plan.title?.trim()) {
            plan.title = buildPlanTitle(nextDevicesLimit, nextPeriod)
        }
        if (!plan.name?.trim()) {
            plan.name = plan.title
        }
        if (!plan.description?.trim()) {
            plan.description = buildPlanDescription(nextDevicesLimit)
        }
        if (!plan.code?.trim()) {
            plan.code = buildPlanCode(nextPeriod, nextDevicesLimit)
        }

        const saved = await this.planRepository.save(plan)
        await this.upsertDeviceLimit(saved.id, nextDevicesLimit)
        return this.attachDeviceLimit(saved)
    }

    async upsertPlanCatalog(
        items: Array<{
            period: number
            devicesLimit: number
            amount: number
            isActive?: boolean
        }>,
    ) {
        const existingPlans = await this.findAllOrdered()
        const byKey = new Map(
            existingPlans.map((plan) => [this.buildMatrixKey(plan.period, Number(plan.devicesLimit || 1)), plan]),
        )
        const touchedIds = new Set<string>()
        const result: Plan[] = []

        for (const item of items) {
            const period = Math.max(1, Number(item.period) || 0)
            const devicesLimit = Math.max(1, Number(item.devicesLimit) || 0)
            if (!period || !devicesLimit) {
                continue
            }

            const current = byKey.get(this.buildMatrixKey(period, devicesLimit))
            const payload = {
                code: buildPlanCode(period, devicesLimit),
                title: buildPlanTitle(devicesLimit, period),
                name: buildPlanTitle(devicesLimit, period),
                description: buildPlanDescription(devicesLimit),
                period,
                amount: Math.max(0, Number(item.amount) || 0),
                isActive: item.isActive !== false,
                devicesLimit,
            }

            const saved = current
                ? await this.planRepository.save({ ...current, ...payload })
                : await this.planRepository.save(this.planRepository.create(payload))

            touchedIds.add(saved.id)
            await this.upsertDeviceLimit(saved.id, devicesLimit)
            result.push(saved)
        }

        for (const plan of existingPlans) {
            const devicesLimit = Number(plan.devicesLimit || 0)
            const isMatrixPlan =
                PLAN_PERIOD_DAYS.includes(plan.period as (typeof PLAN_PERIOD_DAYS)[number]) &&
                PLAN_DEVICE_LIMITS.includes(devicesLimit as (typeof PLAN_DEVICE_LIMITS)[number])

            if (!isMatrixPlan) {
                continue
            }

            if (!touchedIds.has(plan.id)) {
                plan.isActive = false
                await this.planRepository.save(plan)
            }
        }

        return this.attachDeviceLimits(result)
    }

    private buildCatalog(
        plans: Array<{
            id: string
            code?: string | null
            title?: string | null
            description?: string | null
            name: string
            period: number
            amount: number
            isActive: boolean
            devicesLimit?: number | null
        }>,
        includeInactive = false,
    ): PlanCatalogResponse {
        const filtered = includeInactive ? plans : plans.filter((plan) => plan.isActive)
        const monthlyAmounts = new Map<number, number>()
        for (const plan of filtered) {
            const devicesLimit = Number(plan.devicesLimit || 0)
            if (plan.period === 30 && devicesLimit > 0 && !monthlyAmounts.has(devicesLimit)) {
                monthlyAmounts.set(devicesLimit, Number(plan.amount) || 0)
            }
        }

        const cells = filtered.map((plan) =>
            this.toCatalogCell(plan, monthlyAmounts.get(Number(plan.devicesLimit || 0)) ?? null),
        )
        const byKey = new Map(cells.map((cell) => [this.buildMatrixKey(cell.period, cell.devicesLimit), cell]))

        const durations: PlanCatalogDuration[] = PLAN_PERIOD_DAYS.map((period) => ({
            periodDays: period,
            months: daysToMonths(period),
            label: buildPeriodLabel(period),
            startingPriceRub: this.getStartingPrice(filtered, period),
            savingsPercent: this.getStartingPeriodSavings(filtered, period),
        }))

        const rows: PlanCatalogRow[] = PLAN_DEVICE_LIMITS.map((devicesLimit) => ({
            devicesLimit,
            devicesLabel: `${devicesLimit} ${pluralizeDevices(devicesLimit)}`,
            plans: PLAN_PERIOD_DAYS.map((period) => byKey.get(this.buildMatrixKey(period, devicesLimit)) || null),
        }))

        return { durations, rows }
    }

    private toCatalogCell(
        plan: {
            id: string
            code?: string | null
            title?: string | null
            description?: string | null
            name: string
            period: number
            amount: number
            isActive: boolean
            devicesLimit?: number | null
        },
        monthlyAmount: number | null,
    ): PlanCatalogCell {
        const devicesLimit = Number(plan.devicesLimit || 1)
        const savingsPercent = buildSavingsPercent(plan.amount, plan.period, monthlyAmount)

        return {
            id: plan.id,
            code: plan.code,
            title: plan.title,
            name: plan.name,
            description: plan.description,
            period: plan.period,
            amount: plan.amount,
            isActive: plan.isActive,
            devicesLimit,
            savingsPercent,
        }
    }

    private getStartingPrice(
        plans: Array<{
            period: number
            amount: number
            isActive: boolean
            devicesLimit?: number | null
        }>,
        period: number,
    ) {
        const periodPlans = plans.filter((plan) => plan.isActive && plan.period === period)
        if (!periodPlans.length) {
            return 0
        }

        return Math.min(...periodPlans.map((plan) => Number(plan.amount) || 0))
    }

    private buildMatrixKey(period: number, devicesLimit: number) {
        return `${period}:${devicesLimit}`
    }

    private async attachDeviceLimits(plans: Plan[]) {
        return Promise.all(plans.map((plan) => this.attachDeviceLimit(plan)))
    }

    private async attachDeviceLimit(plan: Plan) {
        const devicesLimit =
            plan.devicesLimit !== null && plan.devicesLimit !== undefined
                ? Number(plan.devicesLimit)
                : (await this.getDeviceLimit(plan.id)) || resolveLegacyDevicesLimit(plan)

        return {
            ...plan,
            devicesLimit,
        }
    }

    private async getDeviceLimit(planId: string) {
        const limit = await this.planLimitRepository
            .createQueryBuilder('planLimit')
            .innerJoin('planLimit.meter', 'meter')
            .where('planLimit.planId = :planId', { planId })
            .andWhere('meter.code = :meterCode', { meterCode: VPN_DEVICE_SLOTS_METER_CODE })
            .getOne()

        return limit?.includedUnits ?? null
    }

    private async upsertDeviceLimit(planId: string, devicesLimit: number) {
        const meter = await this.ensureDeviceSlotsMeter()
        const normalizedLimit = Math.max(1, Number(devicesLimit) || 1)
        const existing = await this.planLimitRepository.findOne({
            where: {
                planId,
                meterId: meter.id,
            },
        })

        if (existing) {
            existing.includedUnits = normalizedLimit
            existing.overageAllowed = false
            await this.planLimitRepository.save(existing)
            return
        }

        await this.planLimitRepository.save(
            this.planLimitRepository.create({
                planId,
                meterId: meter.id,
                includedUnits: normalizedLimit,
                overageAllowed: false,
            }),
        )
    }

    private async ensureDeviceSlotsMeter() {
        let meter = await this.meterRepository.findOne({ where: { code: VPN_DEVICE_SLOTS_METER_CODE } })
        if (meter) {
            return meter
        }

        meter = await this.meterRepository.save(
            this.meterRepository.create({
                code: VPN_DEVICE_SLOTS_METER_CODE,
                name: 'VPN Device Slots',
                unit: 'slot',
                isActive: true,
                description: 'Max number of concurrent device slots for VPN plan',
            }),
        )

        return meter
    }

    private getStartingPeriodSavings(
        plans: Array<{
            period: number
            amount: number
            isActive: boolean
            devicesLimit?: number | null
        }>,
        period: number,
    ) {
        const monthlyBase = this.getStartingPrice(plans, 30)
        const amount = this.getStartingPrice(plans, period)
        return buildSavingsPercent(amount, period, monthlyBase)
    }
}
