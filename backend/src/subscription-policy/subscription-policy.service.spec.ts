import { ErrorDto } from '@common/errors/error.dto'

import { SubscriptionPolicyService } from './subscription-policy.service'

describe('SubscriptionPolicyService', () => {
    const service = new SubscriptionPolicyService()

    it('computes trial period for 3 days', () => {
        const now = new Date('2026-01-01T00:00:00.000Z')
        const period = service.computeTrialPeriod(now)
        expect(period.startsAt.toISOString()).toBe(now.toISOString())
        expect(period.endsAt.toISOString()).toBe('2026-01-04T00:00:00.000Z')
    })

    it('computes grace period for 24h', () => {
        const endsAt = new Date('2026-01-01T00:00:00.000Z')
        const period = service.computeGracePeriod(endsAt)
        expect(period.graceEndsAt.toISOString()).toBe('2026-01-02T00:00:00.000Z')
    })

    it('allows trial for both matrix and legacy 30-day single-device plans', () => {
        expect(() =>
            service.assertTrialAllowed(
                { hasUsedTrial: false } as any,
                { code: 'vpn_30_1', period: 30, devicesLimit: 1 },
                false,
            ),
        ).not.toThrow()

        expect(() =>
            service.assertTrialAllowed({ hasUsedTrial: false } as any, { code: 'vpn_1', period: 30 }, false),
        ).not.toThrow()
    })

    it('rejects trial for plans outside the 30-day single-device offer', () => {
        expect(() =>
            service.assertTrialAllowed(
                { hasUsedTrial: false } as any,
                { code: 'vpn_30_2', period: 30, devicesLimit: 2 },
                false,
            ),
        ).toThrow(ErrorDto)
    })
})
