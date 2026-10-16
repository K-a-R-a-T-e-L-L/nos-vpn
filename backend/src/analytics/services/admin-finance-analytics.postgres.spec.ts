import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AdminFinanceAnalyticsService } from './admin-finance-analytics.service'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'
import {
    buildInitdbArguments,
    buildPgCtlStartArguments,
    buildPgCtlStopArguments,
    buildPostgresServerOptions,
    startDisposablePostgres,
    startPostgresProcess,
} from '../testing/disposable-postgres.helper'

const POSTGRES_TEST_TIMEOUT_MS = 60_000

jest.setTimeout(POSTGRES_TEST_TIMEOUT_MS)

describe('portable disposable PostgreSQL arguments', () => {
    it('passes all postgres server options as the single value of one pg_ctl -o', () => {
        const linuxOptions = buildPostgresServerOptions(36051, '/tmp/nosvpn/socket', 'linux')
        expect(linuxOptions).toBe('-h 127.0.0.1 -p 36051 -k /tmp/nosvpn/socket')
        expect(linuxOptions.split(' ').filter((token) => token === '-h')).toHaveLength(1)
        expect(linuxOptions.split(' ').filter((token) => token === '-p')).toHaveLength(1)
        expect(linuxOptions.split(' ').filter((token) => token === '-k')).toHaveLength(1)
        expect(linuxOptions).toContain('/tmp/nosvpn/socket')
        expect(linuxOptions).not.toContain('/var/run/postgresql')

        const windowsOptions = buildPostgresServerOptions(36051, 'C:\\temp\\nosvpn\\socket', 'win32')
        expect(windowsOptions).toBe('-h 127.0.0.1 -p 36051')
        expect(windowsOptions).not.toContain('-k')

        const args = buildPgCtlStartArguments('/tmp/data', '/tmp/postgres.log', 41025, '/tmp/nosvpn/socket', 'linux')
        const optionIndex = args.indexOf('-o')

        expect(args.filter((argument) => argument === '-o')).toHaveLength(1)
        expect(args[optionIndex + 1]).toBe('-h 127.0.0.1 -p 41025 -k /tmp/nosvpn/socket')
        expect(args).not.toContain('-p')
        expect(buildPgCtlStopArguments('/tmp/data')).toEqual(['-D', '/tmp/data', '-m', 'fast', '-w', 'stop'])
        expect(buildInitdbArguments('/tmp/data')).toEqual([
            '-D',
            '/tmp/data',
            '--username=postgres',
            '--auth=trust',
            '--encoding=UTF8',
            '--no-locale',
        ])
    })

    it('includes postgres.log when pg_ctl start fails', () => {
        const root = mkdtempSync(join(tmpdir(), 'nosvpn-pg-error-'))
        const logFile = join(root, 'postgres.log')
        writeFileSync(logFile, 'FATAL: portable harness diagnostic', 'utf8')

        try {
            expect(() =>
                startPostgresProcess('pg_ctl', root, logFile, 41025, join(root, 'socket'), () => {
                    throw new Error('pg_ctl failed')
                }),
            ).toThrow(/postgres\.log:[\s\S]*FATAL: portable harness diagnostic/)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })
})

describe('AdminFinanceAnalyticsService PostgreSQL execution', () => {
    it('executes and orders all six breakdown queries on a disposable PostgreSQL cluster', async () => {
        const cluster = await startDisposablePostgres('nosvpn-breakdowns-pg-')
        let client: any
        let stopError: unknown

        try {
            console.info(`[postgres-regression] pid=${cluster.pid} port=${cluster.port} data=${cluster.dataDirectory}`)

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
                    id uuid PRIMARY KEY, email text, telegram_username text, telegram_first_name text,
                    telegram_last_name text, referred_by_user_id uuid, deleted_at timestamptz
                );
                CREATE TABLE plans (
                    id uuid PRIMARY KEY, code text, title text, name text, deleted_at timestamptz
                );
                CREATE TABLE promo_code (
                    id uuid PRIMARY KEY, code text, deleted_at timestamptz
                );
                CREATE TABLE payments (
                    id uuid PRIMARY KEY, created_at timestamptz NOT NULL, paid_at timestamptz,
                    deleted_at timestamptz, user_id uuid, merchant text, provider text, kind text,
                    is_recurring boolean NOT NULL DEFAULT false, plan_id uuid, amount numeric(12,2) NOT NULL,
                    currency text NOT NULL, status text NOT NULL, activation_status text,
                    metadata_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
                );
            `)
            await client.query(`
                INSERT INTO users (id, email) VALUES
                    ('11111111-1111-4111-8111-111111111111', 'site@example.test'),
                    ('22222222-2222-4222-8222-222222222222', 'bot@example.test');
                INSERT INTO plans (id, code, title, name) VALUES
                    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'MONTH', 'Month', 'Month'),
                    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'YEAR', 'Year', 'Year');
                INSERT INTO promo_code (id, code) VALUES
                    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'SAVE');
                INSERT INTO payments (
                    id, created_at, paid_at, user_id, merchant, provider, kind, is_recurring,
                    plan_id, amount, currency, status, activation_status, metadata_snapshot
                ) VALUES
                    ('00000000-0000-4000-8000-000000000001', now(), now(),
                     '11111111-1111-4111-8111-111111111111', 'SITE', 'YOOKASSA', 'EXTERNAL', false,
                     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 249.00, 'RUB', 'SUCCEEDED', 'ACTIVATED',
                     '{"promo_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}'::jsonb),
                    ('00000000-0000-4000-8000-000000000002', now(), now(),
                     '22222222-2222-4222-8222-222222222222', 'BOT', 'PLATEGA', 'EXTERNAL', true,
                     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 299.00, 'RUB', 'SUCCEEDED', 'ACTIVATED', '{}'::jsonb),
                    ('00000000-0000-4000-8000-000000000003', now(), NULL,
                     '11111111-1111-4111-8111-111111111111', 'SITE', 'YOOKASSA', 'EXTERNAL', false,
                     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 900.00, 'RUB', 'FAILED', 'PENDING', '{}'::jsonb),
                    ('00000000-0000-4000-8000-000000000004', now(), NULL,
                     '22222222-2222-4222-8222-222222222222', 'BOT', 'PLATEGA', 'EXTERNAL', false,
                     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 800.00, 'RUB', 'CANCELED', 'PENDING', '{}'::jsonb),
                    ('00000000-0000-4000-8000-000000000005', now(), now(),
                     '11111111-1111-4111-8111-111111111111', 'SITE', 'YOOKASSA', 'BONUS_BALANCE', false,
                     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1000.00, 'RUB', 'SUCCEEDED', 'ACTIVATED', '{}'::jsonb),
                    ('00000000-0000-4000-8000-000000000006', now(), now(),
                     '11111111-1111-4111-8111-111111111111', 'SITE', 'YOOKASSA', 'PROMO_DISCOUNT', false,
                     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1100.00, 'RUB', 'SUCCEEDED', 'ACTIVATED',
                     '{"promo_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}'::jsonb);
            `)

            const dataSource = {
                query: async (sql: string, parameters: unknown[]) => (await client.query(sql, parameters)).rows,
            }
            const service = new AdminFinanceAnalyticsService(dataSource as any)
            const result = await service.getBreakdowns({ preset: AdminAnalyticsPeriodPreset.LAST_30_DAYS } as any)

            expect(result).toEqual(
                expect.objectContaining({
                    byMerchant: expect.any(Array),
                    byProvider: expect.any(Array),
                    byPaymentType: expect.any(Array),
                    byPlan: expect.any(Array),
                    byStatus: expect.any(Array),
                    promoUsage: expect.any(Array),
                }),
            )
            expect(result.byMerchant.map((item) => item.key)).toEqual(['BOT', 'SITE'])
            expect(result.byMerchant.map((item) => item.grossRevenue)).toEqual(['299.00', '249.00'])
            expect(result.byProvider.map((item) => item.key)).toEqual(['PLATEGA', 'YOOKASSA'])
            expect(result.byPaymentType.some((item) => item.key === 'RECURRENT')).toBe(true)
            expect(result.byPaymentType.some((item) => item.key === 'BONUS')).toBe(false)
            expect(result.byPaymentType.some((item) => item.key === 'PROMO_DISCOUNT')).toBe(false)
            expect(result.byStatus.find((item) => item.key === 'FAILED')?.grossRevenue).toBe('0.00')
            expect(result.byStatus.find((item) => item.key === 'CANCELED')?.grossRevenue).toBe('0.00')
            expect(result.byPlan).toHaveLength(2)
            expect(result.promoUsage).toEqual([{ key: 'SAVE', label: 'SAVE', usageCount: 1 }])
            for (const block of [
                result.byMerchant,
                result.byProvider,
                result.byPaymentType,
                result.byPlan,
                result.byStatus,
            ]) {
                for (const item of block) expect(item.grossRevenue).toMatch(/^\d+\.\d{2}$/)
            }

            const overview = await service.getMoneyOverview({ preset: AdminAnalyticsPeriodPreset.LAST_30_DAYS } as any)
            expect(overview).toMatchObject({
                grossRevenue: '548.00', successfulPayments: 2, uniquePayingUsers: 2, averageCheck: '274.00',
                failedPayments: 1, canceledPayments: 1,
            })
            expect(result.byPaymentType.reduce((sum, item) => sum + item.successfulPayments, 0)).toBe(2)
            expect(result.byPaymentType.reduce((sum, item) => sum + Number(item.grossRevenue), 0)).toBe(548)
            for (const block of [result.byMerchant, result.byProvider, result.byPaymentType, result.byPlan, result.byStatus]) {
                expect(block.reduce((sum, item) => sum + item.successfulPayments, 0)).toBe(2)
                expect(block.reduce((sum, item) => sum + Number(item.grossRevenue), 0)).toBe(548)
            }
        } finally {
            if (client) await client.end().catch(() => undefined)
            try {
                cluster.stop()
            } catch (error) {
                console.error(`[postgres-regression] failed to stop cluster on port ${cluster.port}`, error)
                stopError = error
            }
            if (stopError) throw stopError
        }
    })
})
