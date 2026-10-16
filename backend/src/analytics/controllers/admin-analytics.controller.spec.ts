import { AdminAnalyticsController } from './admin-analytics.controller'
import { RolesEnum } from '../../system/user/enum/roles.enum'
import { AdminRetentionSegment } from '../dto/admin-retention-query.dto'

describe('AdminAnalyticsController retention authorization', () => {
    it('requires ADMIN on all retention routes and delegates', async () => {
        const retentionAnalytics = { getOverview: jest.fn(), listUsers: jest.fn(), getCohorts: jest.fn() }
        const controller = new AdminAnalyticsController({} as any, {} as any, {} as any, retentionAnalytics as any)
        expect(Reflect.getMetadata('role', AdminAnalyticsController.prototype.retentionOverview)).toBe(RolesEnum.ADMIN)
        expect(Reflect.getMetadata('role', AdminAnalyticsController.prototype.retentionUsers)).toBe(RolesEnum.ADMIN)
        expect(Reflect.getMetadata('role', AdminAnalyticsController.prototype.retentionCohorts)).toBe(RolesEnum.ADMIN)
        await controller.retentionOverview(); await controller.retentionUsers({ segment: AdminRetentionSegment.REPEAT_EVER } as any); await controller.retentionCohorts({ months: 12 } as any)
        expect(retentionAnalytics.getOverview).toHaveBeenCalled()
        expect(retentionAnalytics.listUsers).toHaveBeenCalled()
        expect(retentionAnalytics.getCohorts).toHaveBeenCalledWith(12)
    })
})
