import { AdminReferrerAnalyticsService } from './admin-referrer-analytics.service'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'

describe('AdminReferrerAnalyticsService', () => {
    const period = {
        from: new Date('2026-07-31T21:00:00.000Z'),
        to: new Date('2026-08-02T21:00:00.000Z'),
        timezone: 'Europe/Moscow' as const,
        preset: AdminAnalyticsPeriodPreset.CUSTOM,
    }
    const query = jest.fn()
    const financeAnalytics = { resolvePeriod: jest.fn(() => period) }
    const service = new AdminReferrerAnalyticsService({ query } as any, financeAnalytics as any)

    beforeEach(() => {
        query.mockReset()
        financeAnalytics.resolvePeriod.mockClear()
    })

    it('builds lifetime and period CTEs, maps decimal strings and keeps lifetime bonus separate from wallet', async () => {
        query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([
            {
                referrer_id: '11111111-1111-4111-8111-111111111111',
                referrer_email: 'owner@example.test',
                referrer_username: 'owner',
                invited_users: '3',
                paying_invited_users: '2',
                referral_conversion_percent: '66.67',
                referred_successful_payments: '4',
                referred_gross_revenue: '350.00',
                lifetime_awarded_bonus: '175.00',
                current_wallet_balance: '25.00',
                first_referral_at: '2026-07-01T00:00:00.000Z',
                last_referral_at: '2026-08-02T00:00:00.000Z',
                last_awarded_at: '2026-08-02T10:00:00.000Z',
                period_invited_users: '2',
                period_paying_invited_users: '1',
                period_successful_payments: '2',
                period_gross_revenue: '150.00',
                period_awarded_bonus: '75.00',
            },
        ])

        const result = await service.listReferrers({
            preset: AdminAnalyticsPeriodPreset.CUSTOM,
            dateFrom: '2026-08-01',
            dateTo: '2026-08-03',
            metricScope: 'PERIOD',
            onlyWithInvited: false,
            onlyWithPayingInvited: true,
            sortBy: 'referredGrossRevenue',
            sortDir: 'DESC',
            page: 1,
            pageSize: 25,
        } as any)

        expect(query).toHaveBeenCalledTimes(2)
        const [countSql, countParams] = query.mock.calls[0]
        const [listSql] = query.mock.calls[1]
        for (const cte of [
            'eligible_referrers',
            'invite_lifetime',
            'payment_lifetime',
            'ledger_lifetime',
            'invite_period',
            'payment_period',
            'ledger_period',
        ]) {
            expect(countSql).toContain(`${cte} AS`)
        }
        expect(countSql).toContain('period_invited_users = 0')
        expect(countSql).toContain('period_paying_invited_users > 0')
        expect(countParams).toContain(false)
        expect(countParams).toContain(true)
        expect(listSql).toContain('ORDER BY period_gross_revenue DESC, referrer_id DESC')
        expect(listSql).toContain('LIMIT')
        expect(listSql).toContain('OFFSET')
        expect(result.items[0]).toMatchObject({
            invitedUsers: 3,
            payingInvitedUsers: 2,
            referralConversionPercent: '66.67',
            referredSuccessfulPayments: 4,
            referredGrossRevenue: '350.00',
            lifetimeAwardedBonus: '175.00',
            currentWalletBalance: '25.00',
            periodMetrics: {
                invitedUsers: 2,
                payingInvitedUsers: 1,
                referredSuccessfulPayments: 2,
                referredGrossRevenue: '150.00',
                awardedBonus: '75.00',
            },
        })
        expect(result.items[0].lifetimeAwardedBonus).not.toBe(result.items[0].currentWalletBalance)
    })

    it('defines lifetime conversion as distinct paying invitees while successful payments remain transaction rows', async () => {
        query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([{
            referrer_id: '11111111-1111-4111-8111-111111111111', invited_users: '2', paying_invited_users: '1',
            referral_conversion_percent: '50.00', referred_successful_payments: '2', referred_gross_revenue: '548.00',
            lifetime_awarded_bonus: '0.00', current_wallet_balance: '0.00', period_invited_users: '0',
            period_paying_invited_users: '0', period_successful_payments: '0', period_gross_revenue: '0.00', period_awarded_bonus: '0.00',
        }])
        const result = await service.listReferrers({ page: 1, pageSize: 25 } as any)
        expect(result.items[0]).toMatchObject({ invitedUsers: 2, payingInvitedUsers: 1, referralConversionPercent: '50.00', referredSuccessfulPayments: 2, referredGrossRevenue: '548.00' })
    })

    it('parameterizes search, preserves a false boolean and exposes no payout or provider internals', async () => {
        query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([])
        const result = await service.listReferrers({
            referrerSearch: "x' OR 1=1 --",
            onlyWithInvited: false,
            metricScope: 'LIFETIME',
            page: 2,
            pageSize: 10,
            sortBy: 'invitedUsers',
            sortDir: 'ASC',
        } as any)
        const [sql, params] = query.mock.calls[0]
        expect(sql).not.toContain("x' OR 1=1 --")
        expect(params).toContain("%x' or 1=1 --%")
        expect(params).toContain(false)
        expect(sql).toContain('invited_users = 0')
        expect(result).not.toHaveProperty('withdrawn')
        expect(JSON.stringify(result)).not.toMatch(
            /providerPayment|paymentMethod|subscriptionUrl|accessUrl|payload|secret/i,
        )
    })

    it('loads one selected referrer with one server-side earnings aggregate and invited pagination', async () => {
        query
            .mockResolvedValueOnce([
                {
                    referrer_id: '11111111-1111-4111-8111-111111111111',
                    referrer_email: 'owner@example.test',
                    referrer_username: 'owner',
                    lifetime_awarded_bonus: '175.00',
                    current_wallet_balance: '25.00',
                },
            ])
            .mockResolvedValueOnce([
                {
                    current_month: '75.00',
                    previous_month: '20.00',
                    all_time: '175.00',
                    current_month_from: '2026-07-31T21:00:00.000Z',
                    current_month_to: '2026-08-31T21:00:00.000Z',
                    previous_month_from: '2026-06-30T21:00:00.000Z',
                },
            ])
            .mockResolvedValueOnce([{ total: '1' }])
            .mockResolvedValueOnce([
                {
                    invited_user_id: '22222222-2222-4222-8222-222222222222',
                    invited_email: 'invite@example.test',
                    registered_at: '2026-08-01T10:00:00.000Z',
                    first_paid_at: '2026-08-01T11:00:00.000Z',
                    successful_payments: '2',
                    successful_revenue: '150.00',
                    awarded_bonus: '75.00',
                    latest_ledger_status: 'AWARDED',
                    latest_merchant: 'BOT',
                    latest_plan_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    latest_plan_code: 'MONTH',
                    latest_plan_title: 'Месяц',
                    latest_promo_code: 'SAVE',
                },
            ])

        const result = await service.getReferrerInvites(
            '11111111-1111-4111-8111-111111111111',
            {
                invitedSearch: 'invite',
                paidState: 'EVER_PAID',
                page: 2,
                pageSize: 10,
                sortBy: 'successfulRevenue',
                sortDir: 'DESC',
            } as any,
            new Date('2026-08-16T12:00:00.000Z'),
        )

        expect(query).toHaveBeenCalledTimes(4)
        expect(query.mock.calls[0][0]).toContain('WHERE referrer.id = $1::uuid')
        expect(query.mock.calls[0][1]).toEqual(['11111111-1111-4111-8111-111111111111'])
        expect(query.mock.calls[1][0]).toContain("AT TIME ZONE 'Europe/Moscow'")
        expect(query.mock.calls[1][0]).toContain("ledger.status::text = 'AWARDED'")
        expect(query.mock.calls[1][1]).toEqual([
            '11111111-1111-4111-8111-111111111111',
            new Date('2026-08-16T12:00:00.000Z'),
        ])
        expect(query.mock.calls[2][0]).toContain('invited.referred_by_user_id = $3::uuid')
        expect(query.mock.calls[2][0]).toContain('successful_payments > 0')
        expect(query.mock.calls[3][0]).toContain('ORDER BY successful_revenue DESC NULLS LAST, invited_user_id DESC')
        expect(query.mock.calls[3][0]).toContain('LIMIT')
        expect(query.mock.calls[3][0]).toContain('OFFSET')
        expect(result.items[0]).toMatchObject({
            successfulPayments: 2,
            successfulRevenue: '150.00',
            awardedBonus: '75.00',
            latestMerchant: 'BOT',
        })
        expect(result.referrer.id).toBe('11111111-1111-4111-8111-111111111111')
        expect(result.earnings).toEqual({
            currentMonth: '75.00',
            previousMonth: '20.00',
            allTime: '175.00',
            timezone: 'Europe/Moscow',
            currentMonthFrom: '2026-07-31T21:00:00.000Z',
            currentMonthTo: '2026-08-31T21:00:00.000Z',
            previousMonthFrom: '2026-06-30T21:00:00.000Z',
        })
        expect(JSON.stringify(result)).not.toMatch(
            /providerPayment|paymentMethod|subscriptionUrl|accessUrl|payload|secret|telegramId/i,
        )
    })
})
