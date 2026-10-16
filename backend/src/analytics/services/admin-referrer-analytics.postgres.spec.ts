import { AdminFinanceAnalyticsService } from './admin-finance-analytics.service'
import { AdminReferrerAnalyticsService } from './admin-referrer-analytics.service'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'
import { startDisposablePostgres } from '../testing/disposable-postgres.helper'

jest.setTimeout(60_000)

describe('AdminReferrerAnalyticsService PostgreSQL execution', () => {
    it('executes aggregate and selected-referrer SQL on a disposable PostgreSQL cluster', async () => {
        const cluster = await startDisposablePostgres('nosvpn-referrers-pg-')
        let client: any
        let stopError: unknown

        try {
            console.info(
                `[referrer-postgres-regression] pid=${cluster.pid} port=${cluster.port} data=${cluster.dataDirectory}`,
            )

            const { Client } = require('pg')
            client = new Client({
                host: cluster.host,
                port: cluster.port,
                user: cluster.user,
                database: cluster.database,
            })
            await client.connect()
            await client.query(`
                CREATE TABLE users (
                    id uuid PRIMARY KEY, created_at timestamptz NOT NULL, deleted_at timestamptz,
                    email text, telegram_username text, telegram_first_name text, telegram_last_name text,
                    referred_by_user_id uuid, first_paid_at timestamptz,
                    total_referral_bonus_rub numeric(12,2) NOT NULL DEFAULT 0,
                    referral_bonus_balance_rub numeric(12,2) NOT NULL DEFAULT 0
                );
                CREATE TABLE plans (id uuid PRIMARY KEY, code text, title text, name text, deleted_at timestamptz);
                CREATE TABLE promo_code (id uuid PRIMARY KEY, code text, deleted_at timestamptz);
                CREATE TABLE payments (
                    id uuid PRIMARY KEY, created_at timestamptz NOT NULL, paid_at timestamptz, deleted_at timestamptz,
                    user_id uuid, merchant text, kind text, plan_id uuid, amount numeric(12,2) NOT NULL,
                    status text NOT NULL, is_recurring boolean NOT NULL DEFAULT false,
                    metadata_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
                );
                CREATE TABLE referral_bonus_ledger (
                    id uuid PRIMARY KEY, created_at timestamptz NOT NULL, deleted_at timestamptz,
                    referrer_user_id uuid NOT NULL, referred_user_id uuid NOT NULL, payment_id uuid,
                    bonus_rub numeric(12,2) NOT NULL, status text NOT NULL, awarded_at timestamptz,
                    calculation_version text
                );
            `)
            await client.query(`
                INSERT INTO users (id, created_at, email, telegram_username, referred_by_user_id, first_paid_at, total_referral_bonus_rub, referral_bonus_balance_rub) VALUES
                    ('11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00Z', 'owner@example.test', 'owner', NULL, NULL, 175.00, 25.00),
                    ('22222222-2222-4222-8222-222222222222', '2026-01-01T00:00:00Z', 'zero@example.test', 'zero', NULL, NULL, 0.00, 0.00),
                    ('33333333-3333-4333-8333-333333333333', '2026-08-01T07:00:00Z', 'one@example.test', NULL, '11111111-1111-4111-8111-111111111111', '2026-08-01T10:00:00Z', 0, 0),
                    ('44444444-4444-4444-8444-444444444444', '2026-08-02T08:00:00Z', 'two@example.test', NULL, '11111111-1111-4111-8111-111111111111', '2026-09-01T10:00:00Z', 0, 0),
                    ('55555555-5555-4555-8555-555555555555', '2026-07-01T08:00:00Z', 'three@example.test', NULL, '11111111-1111-4111-8111-111111111111', NULL, 0, 0),
                    ('66666666-6666-4666-8666-666666666666', '2026-08-01T09:00:00Z', 'four@example.test', NULL, '22222222-2222-4222-8222-222222222222', NULL, 0, 0);
                INSERT INTO plans (id, code, title, name) VALUES
                    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'MONTH', 'Месяц', 'Месяц'),
                    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'YEAR', 'Год', 'Год');
                INSERT INTO promo_code (id, code) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'SAVE');
                INSERT INTO payments (id, created_at, paid_at, user_id, merchant, kind, plan_id, amount, status, is_recurring, metadata_snapshot) VALUES
                    ('00000000-0000-4000-8000-000000000001', '2026-08-01T10:00:00Z', '2026-08-01T10:00:00Z', '33333333-3333-4333-8333-333333333333', 'SITE', 'EXTERNAL', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 100.00, 'SUCCEEDED', false, '{}'),
                    ('00000000-0000-4000-8000-000000000002', '2026-08-02T10:00:00Z', '2026-08-02T10:00:00Z', '33333333-3333-4333-8333-333333333333', 'BOT', 'EXTERNAL', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 50.00, 'SUCCEEDED', true, '{"promo_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}'),
                    ('00000000-0000-4000-8000-000000000003', '2026-08-02T11:00:00Z', '2026-08-02T11:00:00Z', '33333333-3333-4333-8333-333333333333', 'SITE', 'BONUS_BALANCE', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 999.00, 'SUCCEEDED', false, '{}'),
                    ('00000000-0000-4000-8000-000000000007', '2026-08-02T11:30:00Z', '2026-08-02T11:30:00Z', '33333333-3333-4333-8333-333333333333', 'SITE', 'PROMO_DISCOUNT', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 777.00, 'SUCCEEDED', false, '{}'),
                    ('00000000-0000-4000-8000-000000000004', '2026-08-02T12:00:00Z', NULL, '33333333-3333-4333-8333-333333333333', 'SITE', 'EXTERNAL', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 500.00, 'FAILED', false, '{}'),
                    ('00000000-0000-4000-8000-000000000005', '2026-08-02T13:00:00Z', NULL, '33333333-3333-4333-8333-333333333333', 'SITE', 'EXTERNAL', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 600.00, 'CANCELED', false, '{}'),
                    ('00000000-0000-4000-8000-000000000006', '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z', '44444444-4444-4444-8444-444444444444', 'SITE', 'EXTERNAL', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 200.00, 'SUCCEEDED', false, '{}');
                INSERT INTO referral_bonus_ledger (id, created_at, referrer_user_id, referred_user_id, payment_id, bonus_rub, status, awarded_at, calculation_version) VALUES
                    ('77777777-7777-4777-8777-777777777770', '2026-07-31T20:59:59Z', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', NULL, 10.00, 'AWARDED', '2026-07-31T20:59:59Z', NULL),
                    ('77777777-7777-4777-8777-777777777771', '2026-08-01T10:01:00Z', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000001', 50.00, 'AWARDED', '2026-08-01T10:01:00Z', 'net-v3-fallback-7_5'),
                    ('77777777-7777-4777-8777-777777777772', '2026-08-02T10:01:00Z', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000002', 25.00, 'AWARDED', '2026-08-02T10:01:00Z', 'net-v3-actual-income'),
                    ('77777777-7777-4777-8777-777777777773', '2026-09-01T10:01:00Z', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-000000000006', 100.00, 'AWARDED', '2026-09-01T10:01:00Z', NULL),
                    ('77777777-7777-4777-8777-777777777774', '2026-08-15T10:01:00Z', '22222222-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666666', NULL, 999.00, 'AWARDED', '2026-08-15T10:01:00Z', NULL),
                    ('77777777-7777-4777-8777-777777777775', '2026-08-16T10:01:00Z', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', NULL, 888.00, 'REJECTED', '2026-08-16T10:01:00Z', NULL);
            `)

            const dataSource = {
                query: async (sql: string, parameters: unknown[]) => (await client.query(sql, parameters)).rows,
            }
            const finance = new AdminFinanceAnalyticsService(dataSource as any)
            const service = new AdminReferrerAnalyticsService(dataSource as any, finance)
            const baseQuery = {
                preset: AdminAnalyticsPeriodPreset.CUSTOM,
                dateFrom: '2026-08-01',
                dateTo: '2026-08-03',
                onlyWithInvited: true,
                page: 1,
                pageSize: 25,
                sortBy: 'referredGrossRevenue',
                sortDir: 'DESC',
            }
            const result = await service.listReferrers(baseQuery as any)
            expect(result.items).toHaveLength(2)
            expect(result.items[0]).toMatchObject({
                referrer: { id: '11111111-1111-4111-8111-111111111111', label: '@owner' },
                invitedUsers: 3,
                payingInvitedUsers: 2,
                referralConversionPercent: '66.67',
                referredSuccessfulPayments: 3,
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
            expect(result.items[1].referralConversionPercent).toBe('0.00')

            const zeroPaying = await service.listReferrers({
                ...baseQuery,
                metricScope: 'PERIOD',
                onlyWithPayingInvited: false,
            } as any)
            expect(zeroPaying.items.map((item) => item.referrer.id)).toEqual(['22222222-2222-4222-8222-222222222222'])

            const details = await service.getReferrerInvites(
                '11111111-1111-4111-8111-111111111111',
                {
                    preset: AdminAnalyticsPeriodPreset.CUSTOM,
                    dateFrom: '2026-08-01',
                    dateTo: '2026-08-03',
                    paidState: 'EVER_PAID',
                    page: 1,
                    pageSize: 10,
                    sortBy: 'successfulRevenue',
                    sortDir: 'DESC',
                } as any,
                new Date('2026-08-16T12:00:00.000Z'),
            )
            expect(details.referrer.label).toBe('@owner')
            expect(details.lifetimeAwardedBonus).toBe('175.00')
            expect(details.currentWalletBalance).toBe('25.00')
            expect(details.earnings).toMatchObject({
                currentMonth: '75.00',
                previousMonth: '10.00',
                allTime: '185.00',
                timezone: 'Europe/Moscow',
                currentMonthFrom: '2026-07-31T21:00:00.000Z',
                currentMonthTo: '2026-08-31T21:00:00.000Z',
                previousMonthFrom: '2026-06-30T21:00:00.000Z',
            })
            expect(Number(details.earnings.currentMonth)).toBe(50 + 25)
            expect(details.items).toHaveLength(1)
            expect(details.items[0]).toMatchObject({
                invitedUser: { id: '33333333-3333-4333-8333-333333333333' },
                successfulPayments: 2,
                successfulRevenue: '150.00',
                awardedBonus: '75.00',
                latestLedgerStatus: 'AWARDED',
                latestMerchant: 'BOT',
                latestPlan: { code: 'YEAR', title: 'Год' },
                latestPromoCode: 'SAVE',
            })

            const empty = await service.getReferrerInvites(
                '22222222-2222-4222-8222-222222222222',
                { page: 1, pageSize: 10 } as any,
                new Date('2026-07-15T12:00:00.000Z'),
            )
            expect(empty.earnings).toMatchObject({
                currentMonth: '0.00',
                previousMonth: '0.00',
                allTime: '999.00',
            })
        } finally {
            if (client) await client.end().catch(() => undefined)
            try {
                cluster.stop()
            } catch (error) {
                console.error(`[referrer-postgres-regression] failed to stop cluster on port ${cluster.port}`, error)
                stopError = error
            }
            if (stopError) throw stopError
        }
    })
})
