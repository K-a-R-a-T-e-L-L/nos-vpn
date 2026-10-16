import { BadRequestException } from '@nestjs/common'

import { PlategaRecurrentPlanPolicy, VerifiedPlategaSubscriptionInterval } from './platega-recurrent-plan.policy'

describe('PlategaRecurrentPlanPolicy', () => {
    const policy = new PlategaRecurrentPlanPolicy()

    const canonicalPlan = (period: number, devicesLimit = 1, overrides: Record<string, any> = {}) => ({
        code: `vpn_${period}_${devicesLimit}`,
        period,
        amount: 500,
        devicesLimit,
        isActive: true,
        ...overrides,
    })

    it('records the verified numeric provider interval enum without treating it as an NOS mapping', () => {
        expect(VerifiedPlategaSubscriptionInterval).toMatchObject({ DAY: 1, WEEK: 2, MONTH: 3, YEAR: 4 })
    })

    it.each([
        [30, VerifiedPlategaSubscriptionInterval.MONTH],
        [360, VerifiedPlategaSubscriptionInterval.YEAR],
    ])('maps the exact %s-day recurrent product to the confirmed provider cadence', (period, interval) => {
        expect(policy.map(canonicalPlan(period))).toEqual({
            amount: 500,
            currency: 'RUB',
            interval,
            intervalCount: 1,
            durationDays: period,
        })
    })

    it.each([90, 180])('rejects the non-recurrent exact %s-day NOS plan', (period) => {
        expect(() => policy.map(canonicalPlan(period))).toThrow(BadRequestException)
    })

    it('does not invent a numeric interval for an unknown duration', () => {
        expect(() => policy.map(canonicalPlan(31))).toThrow('unavailable')
    })

    it.each([
        canonicalPlan(30, 1, { code: 'vpn_custom_monthly' }),
        canonicalPlan(360, 1, { code: 'vpn_custom_yearly' }),
        canonicalPlan(30, 99, { code: 'vpn_30_99' }),
        canonicalPlan(30, 1, { isActive: false }),
        canonicalPlan(360, 1, { isActive: false }),
    ])('rejects a non-canonical active matrix identity before mapping: %o', (plan) => {
        expect(() => policy.map(plan)).toThrow(BadRequestException)
    })
})
