import { BadRequestException, Injectable } from '@nestjs/common'

import { Plan } from '../../plan/entity/plan.entity'
import { PLAN_DEVICE_LIMITS, PLAN_PERIOD_DAYS, buildPlanCode } from '../../plan/plan.defaults'
import { PaymentRecurrentCadence } from '../dto/payment-checkout-options.dto'

export interface PlategaRecurrentTerms {
    amount: number
    currency: 'RUB'
    interval: number
    intervalCount: number
    durationDays: number
}

export enum VerifiedPlategaSubscriptionInterval {
    DAY = 1,
    WEEK = 2,
    MONTH = 3,
    YEAR = 4,
}

export type PlategaRecurrentPlanInspection = {
    canonical: boolean
    eligible: boolean
    cadence: PaymentRecurrentCadence | null
}

export function inspectPlategaRecurrentPlan(
    plan: Pick<Plan, 'code' | 'period' | 'devicesLimit' | 'isActive'>,
): PlategaRecurrentPlanInspection {
    const period = Number(plan.period)
    const devicesLimit = Number(plan.devicesLimit)
    const canonical =
        plan.isActive === true &&
        PLAN_PERIOD_DAYS.includes(period as (typeof PLAN_PERIOD_DAYS)[number]) &&
        PLAN_DEVICE_LIMITS.includes(devicesLimit as (typeof PLAN_DEVICE_LIMITS)[number]) &&
        String(plan.code || '') === buildPlanCode(period, devicesLimit)
    const cadence = period === 30 ? PaymentRecurrentCadence.MONTHLY : period === 360 ? PaymentRecurrentCadence.YEARLY : null
    return { canonical, eligible: canonical && cadence !== null, cadence: canonical ? cadence : null }
}

@Injectable()
export class PlategaRecurrentPlanPolicy {
    inspect(plan: Pick<Plan, 'code' | 'period' | 'devicesLimit' | 'isActive'>): PlategaRecurrentPlanInspection {
        return inspectPlategaRecurrentPlan(plan)
    }

    map(plan: Pick<Plan, 'code' | 'period' | 'amount' | 'devicesLimit' | 'isActive'>): PlategaRecurrentTerms {
        const inspection = this.inspect(plan)
        if (!inspection.canonical || !inspection.eligible) {
            throw new BadRequestException(
                `Platega recurrent is unavailable for non-canonical ${Number(plan.period)}-day plans`,
            )
        }
        const period = Number(plan.period)
        const interval =
            period === 30
                ? VerifiedPlategaSubscriptionInterval.MONTH
                : period === 360
                  ? VerifiedPlategaSubscriptionInterval.YEAR
                  : null
        if (!interval) {
            throw new BadRequestException(`Platega recurrent is unavailable for ${period}-day plans`)
        }
        return {
            amount: Number(plan.amount),
            currency: 'RUB',
            interval,
            // Platega confirmed this is the cadence multiplier, not a charge limit.
            intervalCount: 1,
            durationDays: period,
        }
    }
}
