import { BadRequestException } from '@nestjs/common'

import { AdminFinanceAnalyticsService } from './admin-finance-analytics.service'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'

describe('AdminFinanceAnalyticsService period resolution', () => {
    const dataSource = { query: jest.fn() }
    const service = new AdminFinanceAnalyticsService(dataSource as any)
    const now = new Date('2026-08-02T07:30:00.000Z') // 10:30 Moscow

    it.each([
        [AdminAnalyticsPeriodPreset.TODAY, '2026-08-01T21:00:00.000Z', '2026-08-02T21:00:00.000Z'],
        [AdminAnalyticsPeriodPreset.YESTERDAY, '2026-07-31T21:00:00.000Z', '2026-08-01T21:00:00.000Z'],
        [AdminAnalyticsPeriodPreset.LAST_7_DAYS, '2026-07-26T21:00:00.000Z', '2026-08-02T21:00:00.000Z'],
        [AdminAnalyticsPeriodPreset.LAST_30_DAYS, '2026-07-03T21:00:00.000Z', '2026-08-02T21:00:00.000Z'],
        [AdminAnalyticsPeriodPreset.CURRENT_MONTH, '2026-07-31T21:00:00.000Z', '2026-08-31T21:00:00.000Z'],
        [AdminAnalyticsPeriodPreset.PREVIOUS_MONTH, '2026-06-30T21:00:00.000Z', '2026-07-31T21:00:00.000Z'],
    ])('resolves %s in Europe/Moscow', (preset, from, to) => {
        const period = service.resolvePeriod({ preset } as any, now)
        expect(period.from.toISOString()).toBe(from)
        expect(period.to.toISOString()).toBe(to)
        expect(period.timezone).toBe('Europe/Moscow')
    })

    it('resolves CUSTOM as a half-open Moscow date interval', () => {
        const period = service.resolvePeriod(
            { preset: AdminAnalyticsPeriodPreset.CUSTOM, dateFrom: '2026-03-01', dateTo: '2026-03-03' } as any,
            now,
        )
        expect(period.from.toISOString()).toBe('2026-02-28T21:00:00.000Z')
        expect(period.to.toISOString()).toBe('2026-03-02T21:00:00.000Z')
    })

    it('interprets timezone-less ISO datetime in Europe/Moscow', () => {
        const period = service.resolvePeriod({
            preset: AdminAnalyticsPeriodPreset.CUSTOM,
            dateFrom: '2026-03-01T10:15:30',
            dateTo: '2026-03-01T11:15:30',
        } as any, now)
        expect(period.from.toISOString()).toBe('2026-03-01T07:15:30.000Z')
        expect(period.to.toISOString()).toBe('2026-03-01T08:15:30.000Z')
    })

    it.each([
        [{ preset: AdminAnalyticsPeriodPreset.CUSTOM }],
        [{ preset: AdminAnalyticsPeriodPreset.CUSTOM, dateFrom: '2026-01-02', dateTo: '2026-01-01' }],
        [{ preset: AdminAnalyticsPeriodPreset.CUSTOM, dateFrom: '2025-01-01', dateTo: '2026-01-03' }],
    ])('rejects invalid custom period %#', (input) => {
        expect(() => service.resolvePeriod(input as any, now)).toThrow(BadRequestException)
    })

    it('is independent from process timezone', () => {
        const previous = process.env.TZ
        process.env.TZ = 'Pacific/Honolulu'
        try {
            expect(service.resolvePeriod({ preset: AdminAnalyticsPeriodPreset.TODAY } as any, now).from.toISOString())
                .toBe('2026-08-01T21:00:00.000Z')
        } finally {
            process.env.TZ = previous
        }
    })
})

describe('AdminFinanceAnalyticsService SQL safety', () => {
    const query = jest.fn()
    const service = new AdminFinanceAnalyticsService({ query } as any)

    beforeEach(() => query.mockReset())

    it('computes money in PostgreSQL and parameterizes filters', async () => {
        query.mockResolvedValueOnce([{ grossRevenue: '120.00', successfulPayments: '2', uniquePayingUsers: '1', averageCheck: '60.00', firstPurchases: '1', manualRenewals: '0', recurrentPayments: '1', failedPayments: '1', canceledPayments: '0', expiredPayments: '0' }])
        const result = await service.getMoneyOverview({ provider: 'YOOKASSA', userSearch: "x' OR 1=1 --" } as any)
        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain('SUM(')
        expect(sql).toContain('NOT EXISTS')
        expect(result.period.timezone).toBe('Europe/Moscow')
        expect(sql).not.toContain("x' OR 1=1 --")
        expect(parameters).toContain("%x' or 1=1 --%")
    })

    it('uses whitelisted deterministic payment sorting and returns only safe fields', async () => {
        query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([{
            id: '11111111-1111-4111-8111-111111111111', created_at: new Date(), paid_at: new Date(), user_id: null,
            merchant: 'SITE', provider: 'YOOKASSA', payment_type: 'FIRST_PURCHASE', plan_id: null, amount: '10.00',
            currency: 'RUB', status: 'SUCCEEDED', activation_status: 'ACTIVATED', providerPaymentId: 'forbidden',
        }])
        const result = await service.listPayments({ sortBy: 'amount', sortDir: 'ASC', page: 1, pageSize: 25 } as any)
        expect(query.mock.calls[1][0]).toContain('b.amount_numeric ASC')
        expect(query.mock.calls[1][0]).toContain('b.id ASC')
        expect(result.items[0]).not.toHaveProperty('providerPaymentId')
        expect(result.items[0].amount).toBe('10.00')
    })

    it('uses half-open paidAt/createdAt boundaries and every common filter as parameters', async () => {
        query.mockResolvedValueOnce([{}])
        await service.getMoneyOverview({
            merchant: 'BOT', planId: '11111111-1111-4111-8111-111111111111', promoCode: 'SAVE', referred: true,
        } as any)
        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain("p.status = 'SUCCEEDED' AND p.paid_at >= $1 AND p.paid_at < $2")
        expect(sql).toContain("p.status <> 'SUCCEEDED' AND p.created_at >= $1 AND p.created_at < $2")
        expect(sql).toContain('u.referred_by_user_id IS NOT NULL')
        expect(parameters).toEqual(expect.arrayContaining(['BOT', '11111111-1111-4111-8111-111111111111', 'SAVE']))
    })

    it('generates all Moscow days and preserves SQL-formatted zero money', async () => {
        query.mockResolvedValueOnce([{ date: '2026-08-02', grossRevenue: '0.00', successfulPayments: '0' }])
        const result = await service.getTimeseries({ preset: AdminAnalyticsPeriodPreset.TODAY } as any)
        expect(query.mock.calls[0][0]).toContain('generate_series')
        expect(query.mock.calls[0][0]).toContain("AT TIME ZONE 'Europe/Moscow'")
        expect(result.items[0]).toMatchObject({ date: '2026-08-02', grossRevenue: '0.00', successfulPayments: 0 })
    })

    it('builds six parameterized breakdown queries and sorts dimensions by the numeric aggregate', async () => {
        const breakdownRow = { key: 'SITE', label: 'SITE', successfulPayments: '1', grossRevenue: '100.00' }
        query
            .mockResolvedValueOnce([breakdownRow])
            .mockResolvedValueOnce([breakdownRow])
            .mockResolvedValueOnce([breakdownRow])
            .mockResolvedValueOnce([breakdownRow])
            .mockResolvedValueOnce([breakdownRow])
            .mockResolvedValueOnce([{ key: 'SAVE', label: 'SAVE', usageCount: '1' }])

        const result = await service.getBreakdowns({ provider: 'YOOKASSA', merchant: 'SITE' } as any)

        expect(query).toHaveBeenCalledTimes(6)
        const dimensionCalls = query.mock.calls.slice(0, 4)
        const numericOrder = `ORDER BY COALESCE(SUM(amount_numeric) FILTER (WHERE status = 'SUCCEEDED' AND is_cash), 0) DESC, key ASC`

        for (const [sql, parameters] of dimensionCalls) {
            expect(sql).not.toContain('ORDER BY "grossRevenue"::numeric')
            expect(sql).toContain(numericOrder)
            expect(sql).toContain('UPPER(p.provider) = $3')
            expect(sql).toContain('p.merchant::text = $4')
            expect(parameters).toEqual(expect.arrayContaining(['YOOKASSA', 'SITE']))
        }

        expect(dimensionCalls[0][0]).toContain("COALESCE(merchant, 'UNKNOWN') AS key")
        expect(dimensionCalls[0][0]).toContain('FROM payment_base WHERE is_cash GROUP BY 1')
        expect(dimensionCalls[1][0]).toContain("COALESCE(UPPER(provider), 'UNKNOWN') AS key")
        expect(dimensionCalls[1][0]).toContain('FROM payment_base WHERE is_cash GROUP BY 1')
        expect(dimensionCalls[2][0]).toContain('payment_type AS key')
        expect(dimensionCalls[2][0]).toContain('FROM payment_base WHERE is_cash GROUP BY 1')
        expect(dimensionCalls[3][0]).toContain('status AS key')
        expect(dimensionCalls[3][0]).toContain("COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash)")
        expect(query.mock.calls[4][0]).toContain('plan_totals AS')
        expect(query.mock.calls[4][0]).toContain('FROM payment_base WHERE is_cash GROUP BY 1, 2')
        expect(query.mock.calls[4][0]).toContain('row_number() OVER (ORDER BY revenue DESC, key ASC)')
        expect(query.mock.calls[5][0]).toContain('ORDER BY COUNT(*) DESC, key ASC')
        expect(query.mock.calls[5][0]).toContain("status = 'SUCCEEDED' AND is_cash")
        expect(result).toMatchObject({
            byMerchant: [{ successfulPayments: 1, grossRevenue: '100.00' }],
            byProvider: [{ successfulPayments: 1, grossRevenue: '100.00' }],
            byPaymentType: [{ successfulPayments: 1, grossRevenue: '100.00' }],
            byPlan: [{ successfulPayments: 1, grossRevenue: '100.00' }],
            byStatus: [{ successfulPayments: 1, grossRevenue: '100.00' }],
            promoUsage: [{ usageCount: 1 }],
        })
        expect(typeof result.byMerchant[0].grossRevenue).toBe('string')
        expect(typeof result.byMerchant[0].successfulPayments).toBe('number')
    })

    it('computes referral metrics with grouped lateral SQL and no fabricated payout fields', async () => {
        query.mockResolvedValueOnce([{
            referredRegistrations: '0', referredPayingUsers: '0', successfulPayments: '0', conversionPercent: '0.00', referredGrossRevenue: '0.00',
            awardedBonusTotal: '0.00', pendingBonusCount: '0', rejectedBonusCount: '0',
        }])
        const result = await service.getReferralOverview({} as any)
        const sql = query.mock.calls[0][0]
        expect(sql).toContain('payment_metrics AS')
        expect(sql).toContain('FROM referred_users ru JOIN payments pay')
        expect(sql).toContain("pay.status = 'SUCCEEDED'")
        expect(sql).toContain("ledger.status = 'AWARDED'")
        expect(sql).not.toMatch(/withdraw|paid.?out|refund/i)
        expect(result).not.toHaveProperty('withdrawn')
        expect(result.successfulPayments).toBe(0)
        expect(result.conversionPercent).toBe('0.00')
    })

    it('keeps successful cash overview and payment-type breakdowns on one external-payment dataset', async () => {
        query.mockResolvedValueOnce([{ grossRevenue: '548.00', successfulPayments: '2', uniquePayingUsers: '2', averageCheck: '274.00' }])
        const overview = await service.getMoneyOverview({} as any)
        expect(overview).toMatchObject({ grossRevenue: '548.00', successfulPayments: 2, uniquePayingUsers: 2, averageCheck: '274.00' })

        const breakdown = { key: 'FIRST_PURCHASE', label: 'FIRST_PURCHASE', successfulPayments: '2', grossRevenue: '548.00' }
        query.mockReset()
        query.mockResolvedValue([breakdown])
        const result = await service.getBreakdowns({} as any)
        expect(result.byPaymentType).toEqual([{ successfulPayments: 2, grossRevenue: '548.00', key: 'FIRST_PURCHASE', label: 'FIRST_PURCHASE' }])
        expect(query.mock.calls[2][0]).toContain("WHERE is_cash")
    })

    it('uses deterministic referral latest-payment and paginated sorting', async () => {
        query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([])
        await service.listReferrals({ page: 1, pageSize: 25, sortBy: 'successfulRevenue', sortDir: 'DESC' } as any)
        const sql = query.mock.calls[1][0]
        expect(sql).toContain('ORDER BY pay.paid_at DESC, pay.id DESC LIMIT 1')
        expect(sql).toContain('ORDER BY successful_revenue DESC NULLS LAST, invited_user_id DESC')
        expect(sql).toContain('LIMIT')
    })
})
