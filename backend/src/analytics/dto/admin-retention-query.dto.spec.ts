import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { AdminRetentionCohortsQueryDto, AdminRetentionSegment, AdminRetentionSortBy, AdminRetentionUsersQueryDto } from './admin-retention-query.dto'

describe('retention query DTO validation', () => {
    it.each([6, 12, 24])('accepts months=%s and transforms strings', async (months) => {
        const dto = plainToInstance(AdminRetentionCohortsQueryDto, { months: String(months) })
        expect(dto.months).toBe(months)
        expect(await validate(dto)).toHaveLength(0)
    })
    it.each([5, 7, 13, 25, 'bad'])('rejects invalid months=%s', async (months) => {
        expect(await validate(plainToInstance(AdminRetentionCohortsQueryDto, { months }))).not.toHaveLength(0)
    })
    it('defaults cohorts to twelve months', async () => {
        const dto = plainToInstance(AdminRetentionCohortsQueryDto, {})
        expect(dto.months).toBe(12)
        expect(await validate(dto)).toHaveLength(0)
    })
    it('validates required segment, bounds and sorting', async () => {
        const dto = plainToInstance(AdminRetentionUsersQueryDto, { segment: AdminRetentionSegment.REPEAT_EVER, page: '1', pageSize: '100', sortBy: AdminRetentionSortBy.CASH_PAYMENTS, sortDir: 'ASC' })
        expect(await validate(dto)).toHaveLength(0)
        for (const value of [{}, { segment: 'NOPE' }, { segment: AdminRetentionSegment.REPEAT_EVER, page: 0 }, { segment: AdminRetentionSegment.REPEAT_EVER, pageSize: 9 }, { segment: AdminRetentionSegment.REPEAT_EVER, pageSize: 101 }, { segment: AdminRetentionSegment.REPEAT_EVER, sortBy: 'bad' }, { segment: AdminRetentionSegment.REPEAT_EVER, sortDir: 'bad' }])
            expect(await validate(plainToInstance(AdminRetentionUsersQueryDto, value))).not.toHaveLength(0)
    })
})
