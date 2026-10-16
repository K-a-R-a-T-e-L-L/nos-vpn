import { AdminRetentionAnalyticsService } from './admin-retention-analytics.service'
import { AdminRetentionSegment } from '../dto/admin-retention-query.dto'

describe('AdminRetentionAnalyticsService', () => {
    const query = jest.fn()
    const service = new AdminRetentionAnalyticsService({ query } as any)
    beforeEach(() => query.mockReset())

    it('uses the canonical external cash predicate and current grace entitlement in overview SQL', async () => {
        query.mockResolvedValueOnce([{}])
        await service.getOverview(new Date('2026-09-10T00:00:00.000Z'))
        const sql = query.mock.calls[0][0]
        expect(sql).toContain("p.status = 'SUCCEEDED'")
        expect(sql).toContain("p.amount::numeric > 0")
        expect(sql).toContain("COALESCE(p.kind::text, 'EXTERNAL') = 'EXTERNAL'")
        expect(sql).toContain('p.deleted_at IS NULL')
        expect(sql).toContain("s.status::text = 'GRACE' AND s.grace_ends_at >")
        expect(sql).toContain("u.role::text = 'USER'")
    })

    it('uses a whitelisted segment and returns no cross-segment data itself', async () => {
        query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([])
        const result = await service.listUsers({ segment: AdminRetentionSegment.ONE_PAYMENT_NO_PAID_ENTITLEMENT, page: 1, pageSize: 25 } as any)
        expect(query.mock.calls[1][0]).toContain('cash_payment_count = 1 AND NOT currently_paid_entitled')
        expect(result).toMatchObject({ segment: AdminRetentionSegment.ONE_PAYMENT_NO_PAID_ENTITLEMENT, total: 0 })
    })
})
