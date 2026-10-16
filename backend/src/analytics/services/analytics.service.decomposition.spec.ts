import { AnalyticsService } from './analytics.service'

describe('AnalyticsService decomposition', () => {
    it('is a two-collaborator facade for attribution writes and analytics reads', async () => {
        const attribution = {
            claimUserSource: jest.fn().mockResolvedValue({ id: 'attribution-1' }),
            trackBotStart: jest.fn(),
        }
        const query = {
            createSource: jest.fn(),
            getOverview: jest.fn().mockResolvedValue({ totalUsers: 1 }),
        }
        const service = new (AnalyticsService as any)(attribution, query)
        const options = { entryPoint: 'website', landingPath: '/earn' }

        await expect(service.claimUserSource('user-1', 'partner', options)).resolves.toEqual({ id: 'attribution-1' })
        await expect(service.getOverview()).resolves.toEqual({ totalUsers: 1 })

        expect(AnalyticsService.length).toBe(2)
        expect(attribution.claimUserSource).toHaveBeenCalledWith('user-1', 'partner', options)
        expect(query.getOverview).toHaveBeenCalledTimes(1)
    })
})
