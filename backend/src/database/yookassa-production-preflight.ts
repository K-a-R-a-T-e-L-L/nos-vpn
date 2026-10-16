import 'dotenv/config'
import { DataSource } from 'typeorm'

import {
    YooKassaSchemaMode,
    resolveYooKassaSchemaMode,
} from './yookassa-schema-mode'
import { assertYooKassaSchemaContract } from './yookassa-synchronize-bootstrap.service'

const REQUIRED_TABLES = [
    'users',
    'plans',
    'subscriptions',
    'payments',
    'payment_webhook_events',
]
const YK_TABLES = [
    'payment_methods',
    'subscription_renewals',
    'payment_attempts',
]

export interface YooKassaPreflightDataSource {
    initialize(): Promise<unknown>
    query(query: string, parameters?: unknown[]): Promise<any>
    destroy(): Promise<unknown>
}

type PreflightEnvironment = Record<string, string | undefined>

async function createPreflightDataSource(
    mode: YooKassaSchemaMode,
    env: PreflightEnvironment,
): Promise<YooKassaPreflightDataSource> {
    if (mode === YooKassaSchemaMode.MIGRATIONS) {
        const migrationRunner = await import('./yookassa-migration.datasource')
        return migrationRunner.default
    }

    return new DataSource({
        type: 'postgres',
        host: env.DATABASE_HOST,
        port: Number(env.DATABASE_PORT || 5432),
        username: env.DATABASE_USER,
        password: env.DATABASE_PASSWORD,
        database: env.DATABASE_DB,
        entities: [__dirname + '/../**/*.entity.{ts,js}'],
        synchronize: false,
        migrationsRun: false,
        installExtensions: false,
        logging: false,
    })
}

export async function runYooKassaProductionPreflight(
    dataSource: YooKassaPreflightDataSource,
    env: PreflightEnvironment,
): Promise<Record<string, unknown>> {
    const schemaMode = resolveYooKassaSchemaMode(env.DB_SYNCHRONIZE)
    await dataSource.initialize()
    try {
        const db = await dataSource.query(`
            SELECT current_setting('server_version_num')::int AS version_num,
                   current_database() AS database_name,
                   current_user AS database_user,
                   pg_is_in_recovery() AS in_recovery,
                   to_regprocedure('gen_random_uuid()') IS NOT NULL AS has_random_uuid
        `)
        const state = db[0]
        if (Number(state.version_num) < 120000) {
            throw new Error('PostgreSQL 12 or newer is required')
        }
        if (state.in_recovery) {
            throw new Error('Writable primary PostgreSQL is required')
        }
        if (!state.has_random_uuid) {
            throw new Error('gen_random_uuid() is not registered')
        }

        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()
             AND table_name = ANY($1::text[])`,
            [[...REQUIRED_TABLES, ...YK_TABLES, 'yookassa_migrations']],
        )
        const names = new Set(tables.map((row) => row.table_name))
        for (const table of REQUIRED_TABLES) {
            if (!names.has(table)) throw new Error(`Missing core table: ${table}`)
        }

        const ykCount = YK_TABLES.filter((table) => names.has(table)).length
        const hasHistory = names.has('yookassa_migrations')
        let migrationHistoryCount = '0'
        if (hasHistory) {
            const history = await dataSource.query(
                `SELECT count(*)::bigint AS count FROM yookassa_migrations`,
            )
            migrationHistoryCount = String(history[0]?.count ?? '0')
        }

        if (schemaMode === YooKassaSchemaMode.SYNCHRONIZE) {
            await assertYooKassaSchemaContract(dataSource)
        } else {
            if (ykCount > 0 && (ykCount < YK_TABLES.length || !hasHistory)) {
                throw new Error('Partial unmanaged YooKassa schema detected')
            }
            if (ykCount === YK_TABLES.length) {
                await assertYooKassaSchemaContract(dataSource)
            }
        }

        const providerAggregates = await dataSource.query(
            `SELECT provider, count(*)::bigint AS count FROM payments GROUP BY provider ORDER BY provider`,
        )
        const unknownProviders = await dataSource.query(
            `SELECT count(*)::bigint AS count FROM payments
             WHERE provider NOT IN ('platega','yookassa','bonus_balance','promo_discount')`,
        )
        const profiles = await dataSource.query(
            `SELECT COALESCE(metadata_snapshot->>'payment_profile','NULL') AS payment_profile,
                    count(*)::bigint AS count
             FROM payments GROUP BY 1 ORDER BY 1`,
        )
        const projections = await dataSource.query(
            `SELECT CASE
                WHEN metadata_snapshot->>'payment_profile' = 'web' THEN 'SITE'
                WHEN metadata_snapshot->>'payment_profile' = 'bot' THEN 'BOT'
                ELSE 'NULL' END AS projected_merchant,
                count(*)::bigint AS count FROM payments GROUP BY 1 ORDER BY 1`,
        )
        const sizes = await dataSource.query(
            `SELECT relname AS table_name, pg_total_relation_size(oid)::bigint AS bytes
             FROM pg_class WHERE relname = ANY($1::text[]) ORDER BY relname`,
            [REQUIRED_TABLES],
        )
        const privileges = await dataSource.query(
            `SELECT has_schema_privilege(current_user, current_schema(), 'USAGE') AS schema_usage,
                    has_schema_privilege(current_user, current_schema(), 'CREATE') AS schema_create`,
        )
        if (
            !privileges[0]?.schema_usage ||
            !privileges[0]?.schema_create
        ) {
            throw new Error('Database user lacks required schema privileges')
        }

        return {
            ok: true,
            schemaMode,
            version: Number(state.version_num),
            database: String(state.database_name).slice(0, 64),
            user: String(state.database_user).slice(0, 64),
            history: hasHistory ? 'present' : 'absent',
            migrationHistoryCount,
            yookassaTablesPresent: ykCount,
            providerAggregates,
            unknownProviders: unknownProviders[0]?.count,
            paymentProfiles: profiles,
            merchantProjections: projections,
            tableSizes: sizes,
        }
    } finally {
        await dataSource.destroy()
    }
}

async function main() {
    const schemaMode = resolveYooKassaSchemaMode(
        process.env.DB_SYNCHRONIZE,
    )
    const dataSource = await createPreflightDataSource(schemaMode, process.env)
    const result = await runYooKassaProductionPreflight(
        dataSource,
        process.env,
    )
    console.log(JSON.stringify(result))
}

if (require.main === module) {
    main().catch((error) => {
        console.error(
            `YooKassa preflight failed: ${String(error?.message || error).slice(0, 500)}`,
        )
        process.exitCode = 1
    })
}
