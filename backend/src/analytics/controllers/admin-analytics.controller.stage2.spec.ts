import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'

import { AdminAnalyticsController } from './admin-analytics.controller'
import { RolesEnum } from '../../system/user/enum/roles.enum'

describe('AdminAnalyticsController Stage 2 routes', () => {
    it('delegates new read-only endpoints without changing attribution methods', async () => {
        const legacy = { getOverview: jest.fn() }
        const finance = {
            getMoneyOverview: jest.fn().mockResolvedValue({ grossRevenue: '0.00' }),
            getTimeseries: jest.fn(),
            getBreakdowns: jest.fn(),
            listPayments: jest.fn(),
            getReferralOverview: jest.fn(),
            listReferrals: jest.fn(),
        }
        const controller = new AdminAnalyticsController(legacy as any, finance as any, {} as any)
        await controller.moneyOverview({} as any)
        expect(finance.getMoneyOverview).toHaveBeenCalled()
        expect(legacy.getOverview).not.toHaveBeenCalled()
    })

    it('preserves the legacy attribution overview delegation', async () => {
        const legacy = { getOverview: jest.fn().mockResolvedValue({ totalUsers: 1 }) }
        const controller = new AdminAnalyticsController(legacy as any, {} as any, {} as any)
        await controller.overview()
        expect(legacy.getOverview).toHaveBeenCalledTimes(1)
    })

    it('preserves the ADMIN money/breakdowns route and response shape', async () => {
        const response = {
            period: {
                from: '2026-07-01T00:00:00.000Z',
                to: '2026-08-01T00:00:00.000Z',
                timezone: 'Europe/Moscow',
                preset: 'LAST_30_DAYS',
            },
            byMerchant: [{ key: 'SITE', label: 'SITE', successfulPayments: 1, grossRevenue: '100.00' }],
            byProvider: [],
            byPaymentType: [],
            byPlan: [],
            byStatus: [],
            promoUsage: [],
        }
        const finance = { getBreakdowns: jest.fn().mockResolvedValue(response) }
        const controller = new AdminAnalyticsController({} as any, finance as any, {} as any)
        const query = { preset: 'LAST_30_DAYS' }

        await expect(controller.moneyBreakdowns(query as any)).resolves.toEqual(response)
        expect(finance.getBreakdowns).toHaveBeenCalledWith(query)

        const handler = AdminAnalyticsController.prototype.moneyBreakdowns
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('money/breakdowns')
        expect(Reflect.getMetadata('role', handler)).toBe(RolesEnum.ADMIN)
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2)
    })

    it('protects and delegates aggregate referrer routes without replacing legacy referrals', async () => {
        const referrers = {
            listReferrers: jest.fn().mockResolvedValue({ items: [] }),
            getReferrerInvites: jest.fn().mockResolvedValue({ items: [] }),
        }
        const controller = new AdminAnalyticsController({} as any, {} as any, referrers as any)
        const query = { page: 1, pageSize: 25 }

        await expect(controller.referrers(query as any)).resolves.toEqual({ items: [] })
        await expect(controller.referrerInvites('11111111-1111-4111-8111-111111111111', query as any)).resolves.toEqual(
            { items: [] },
        )
        expect(referrers.listReferrers).toHaveBeenCalledWith(query)
        expect(referrers.getReferrerInvites).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', query)

        for (const [handler, path] of [
            [AdminAnalyticsController.prototype.referrers, 'referrals/referrers'],
            [AdminAnalyticsController.prototype.referrerInvites, 'referrals/referrers/:userId/invites'],
        ] as const) {
            expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path)
            expect(Reflect.getMetadata('role', handler)).toBe(RolesEnum.ADMIN)
            expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2)
        }
        expect(Reflect.getMetadata(PATH_METADATA, AdminAnalyticsController.prototype.referrals)).toBe('referrals')
    })
})
