import { AdminRetentionAnalyticsService } from './admin-retention-analytics.service'
import { AdminRetentionSegment } from '../dto/admin-retention-query.dto'
import { startDisposablePostgres } from '../testing/disposable-postgres.helper'

jest.setTimeout(60_000)

describe('AdminRetentionAnalyticsService PostgreSQL execution', () => {
    it('reconciles null-subscription, admin-grant, grace and cash segment semantics', async () => {
        const cluster = await startDisposablePostgres('nosvpn-retention-pg-')
        let client: any
        try {
            console.info(`[retention-postgres] pid=${cluster.pid} port=${cluster.port}`)
            const { Client } = require('pg')
            client = new Client({ host: cluster.host, port: cluster.port, user: cluster.user, database: cluster.database })
            await client.connect()
            await client.query(`CREATE TABLE users (id uuid primary key, email text, telegram_username text, telegram_first_name text, telegram_last_name text, created_at timestamptz not null, deleted_at timestamptz, role text not null, has_used_trial boolean not null default false, trial_used_at timestamptz, is_blocked boolean not null default false);
              CREATE TABLE plans (id uuid primary key, code text, title text, name text, deleted_at timestamptz);
              CREATE TABLE subscriptions (user_id uuid, status text, ends_at timestamptz, grace_ends_at timestamptz, is_trial boolean, plan_id uuid, deleted_at timestamptz);
              CREATE TABLE payments (user_id uuid, status text, amount numeric, kind text, deleted_at timestamptz, paid_at timestamptz, is_recurring boolean not null default false);`)
            await client.query(`INSERT INTO users VALUES
              ('00000000-0000-4000-8000-000000000001','one-none',null,null,null,'2026-08-01Z',null,'USER',false,null,false),
              ('00000000-0000-4000-8000-000000000002','trial-none',null,null,null,'2026-08-02Z',null,'USER',true,'2026-08-02Z',false),
              ('00000000-0000-4000-8000-000000000003','admin-grant',null,null,null,'2026-08-03Z',null,'USER',false,null,false),
              ('00000000-0000-4000-8000-000000000004','one-active',null,null,null,'2026-08-04Z',null,'USER',false,null,false),
              ('00000000-0000-4000-8000-000000000005','repeat-active',null,null,null,'2026-08-05Z',null,'USER',true,'2026-08-05Z',false),
              ('00000000-0000-4000-8000-000000000006','trial-expired',null,null,null,'2026-08-06Z',null,'USER',true,'2026-08-06Z',false),
              ('00000000-0000-4000-8000-000000000007','admin-role',null,null,null,'2026-08-07Z',null,'ADMIN',false,null,false);`)
            await client.query(`INSERT INTO subscriptions VALUES
              ('00000000-0000-4000-8000-000000000003','ACTIVE','2026-10-01Z',null,false,null,null),
              ('00000000-0000-4000-8000-000000000004','ACTIVE','2026-10-01Z',null,false,null,null),
              ('00000000-0000-4000-8000-000000000005','GRACE','2026-09-09Z','2026-09-11Z',false,null,null),
              ('00000000-0000-4000-8000-000000000006','EXPIRED','2026-09-01Z',null,true,null,null);`)
            await client.query(`INSERT INTO payments VALUES
              ('00000000-0000-4000-8000-000000000001','SUCCEEDED',100,'EXTERNAL',null,'2026-08-02Z',false),
              ('00000000-0000-4000-8000-000000000004','SUCCEEDED',100,null,null,'2026-08-05Z',false),
              ('00000000-0000-4000-8000-000000000005','SUCCEEDED',100,'EXTERNAL',null,'2026-08-06Z',false),
              ('00000000-0000-4000-8000-000000000005','SUCCEEDED',100,'EXTERNAL',null,'2026-09-01Z',true),
              ('00000000-0000-4000-8000-000000000007','SUCCEEDED',100,'EXTERNAL',null,'2026-08-08Z',false),
              ('00000000-0000-4000-8000-000000000001','SUCCEEDED',100,'BONUS_BALANCE',null,'2026-08-03Z',false),
              ('00000000-0000-4000-8000-000000000001','FAILED',100,'EXTERNAL',null,'2026-08-03Z',false);`)
            const service = new AdminRetentionAnalyticsService({ query: async (sql: string, parameters: unknown[]) => (await client.query(sql, parameters)).rows } as any)
            const asOf = new Date('2026-09-10T00:00:00.000Z')
            const overview = await service.getOverview(asOf)
            expect(overview).toMatchObject({ customerUsers: 6, currentPaidUsers: 2, activeRepeatPayers: 1, repeatPayersEver: 1, onePaymentNoPaidEntitlement: 1, trialOnlyNoEntitlement: 2, trialUsers: 3, trialConvertedUsers: 1, payingUsersEver: 3, trialConversionRate: '33.33', repeatPurchaseRate: '33.33' })
            const ids = async (segment: AdminRetentionSegment) => (await service.listUsers({ segment, page: 1, pageSize: 25 } as any, asOf)).items.map((item: any) => item.user.email).sort()
            await expect(ids(AdminRetentionSegment.ACTIVE_PAID)).resolves.toEqual(['one-active', 'repeat-active'])
            await expect(ids(AdminRetentionSegment.ACTIVE_REPEAT)).resolves.toEqual(['repeat-active'])
            await expect(ids(AdminRetentionSegment.REPEAT_EVER)).resolves.toEqual(['repeat-active'])
            await expect(ids(AdminRetentionSegment.ONE_PAYMENT_NO_PAID_ENTITLEMENT)).resolves.toEqual(['one-none'])
            await expect(ids(AdminRetentionSegment.TRIAL_ONLY_NO_ENTITLEMENT)).resolves.toEqual(['trial-expired', 'trial-none'])
            await expect(ids(AdminRetentionSegment.TRIAL_TO_PAID)).resolves.toEqual(['repeat-active'])
            const cohorts = await service.getCohorts(6, asOf)
            expect(cohorts.items.find((item: any) => item.month === '2026-08')).toMatchObject({ activePaidUsers: 2, registeredUsers: 6 })
        } finally { if (client) await client.end().catch(() => undefined); cluster.stop() }
    })
})
