import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Meter } from '../../billing/entities/meter.entity'
import { PlanLimit } from '../../billing/entities/plan-limit.entity'
import { Plan } from '../entity/plan.entity'
import {
    DEFAULT_VPN_PLANS,
    PLAN_DEVICE_LIMITS,
    PLAN_PERIOD_DAYS,
    buildPlanCode,
} from '../plan.defaults'

const VPN_DEVICE_SLOTS_METER_CODE = 'vpn_device_slots'

@Injectable()
export class PlanBootstrapService implements OnModuleInit {
    constructor(
        @InjectRepository(Plan)
        private readonly planRepository: Repository<Plan>,
        @InjectRepository(Meter)
        private readonly meterRepository: Repository<Meter>,
        @InjectRepository(PlanLimit)
        private readonly planLimitRepository: Repository<PlanLimit>,
    ) {}

    async onModuleInit() {
        const existingPlans = await this.planRepository.find({ withDeleted: true })

        if (existingPlans.length === 0) {
            const plans = await this.planRepository.save(DEFAULT_VPN_PLANS.map((plan) => this.planRepository.create(plan)))
            await this.ensureDefaultDeviceSlotLimits(plans)
            return
        }

        await this.ensureMatrixCatalog(existingPlans)
    }

    private async ensureMatrixCatalog(existingPlans: Plan[]) {
        const activePlans = existingPlans.filter((plan) => !plan.deletedAt && plan.isActive)
        const matrixPlanKeys = new Set(
            activePlans
                .map((plan) => {
                    const devicesLimit = Number(plan.devicesLimit || 0)
                    if (
                        !PLAN_PERIOD_DAYS.includes(plan.period as (typeof PLAN_PERIOD_DAYS)[number]) ||
                        !PLAN_DEVICE_LIMITS.includes(devicesLimit as (typeof PLAN_DEVICE_LIMITS)[number])
                    ) {
                        return null
                    }

                    return buildPlanCode(plan.period, devicesLimit)
                })
                .filter(Boolean) as string[],
        )

        if (matrixPlanKeys.size === DEFAULT_VPN_PLANS.length) {
            await this.ensureDefaultDeviceSlotLimits(activePlans)
            return
        }

        const plansByCode = new Map(existingPlans.filter((plan) => !plan.deletedAt).map((plan) => [plan.code || '', plan]))
        const createdOrUpdated: Plan[] = []

        for (const defaultPlan of DEFAULT_VPN_PLANS) {
            const current = plansByCode.get(defaultPlan.code || '')
            if (current) {
                current.title = defaultPlan.title
                current.name = defaultPlan.name
                current.description = defaultPlan.description
                current.period = defaultPlan.period
                current.amount = defaultPlan.amount
                current.isActive = defaultPlan.isActive
                current.devicesLimit = defaultPlan.devicesLimit
                createdOrUpdated.push(await this.planRepository.save(current))
                continue
            }

            createdOrUpdated.push(await this.planRepository.save(this.planRepository.create(defaultPlan)))
        }

        for (const plan of activePlans) {
            const code = String(plan.code || '')
            const isCurrentMatrixPlan = DEFAULT_VPN_PLANS.some((item) => item.code === code)
            if (isCurrentMatrixPlan) {
                continue
            }

            if (code === 'vpn_1' || code === 'vpn_2' || code === 'vpn_3') {
                plan.isActive = false
                await this.planRepository.save(plan)
            }
        }

        await this.ensureDefaultDeviceSlotLimits(createdOrUpdated)
    }

    private async ensureDefaultDeviceSlotLimits(plans: Plan[]) {
        let meter = await this.meterRepository.findOne({ where: { code: VPN_DEVICE_SLOTS_METER_CODE } })
        if (!meter) {
            meter = await this.meterRepository.save(
                this.meterRepository.create({
                    code: VPN_DEVICE_SLOTS_METER_CODE,
                    name: 'VPN Device Slots',
                    unit: 'slot',
                    isActive: true,
                    description: 'Max number of concurrent device slots for VPN plan',
                }),
            )
        }

        const limits: PlanLimit[] = []
        for (const plan of plans) {
            const includedUnits = Math.max(1, Number(plan.devicesLimit) || 1)
            const existingLimit = await this.planLimitRepository.findOne({
                where: {
                    planId: plan.id,
                    meterId: meter.id,
                },
            })

            if (existingLimit) {
                existingLimit.includedUnits = includedUnits
                existingLimit.overageAllowed = false
                await this.planLimitRepository.save(existingLimit)
                continue
            }

            limits.push(
                this.planLimitRepository.create({
                    planId: plan.id,
                    meterId: meter.id,
                    includedUnits,
                    overageAllowed: false,
                }),
            )
        }

        if (limits.length > 0) {
            await this.planLimitRepository.save(limits)
        }
    }
}
