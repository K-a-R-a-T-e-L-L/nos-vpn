import {
    YooKassaPreflightDataSource,
    runYooKassaProductionPreflight,
} from './yookassa-production-preflight'

const CORE_TABLES = ['users', 'plans', 'subscriptions', 'payments', 'payment_webhook_events']
const YK_TABLES = ['payment_methods', 'subscription_renewals', 'payment_attempts']

function makeDataSource(options: {
    tables?: string[]
    missingContract?: string[]
    historyCount?: string
} = {}): YooKassaPreflightDataSource {
    const tables = options.tables ?? [...CORE_TABLES, ...YK_TABLES]
    return {
        initialize: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(async (sql: string) => {
            if (sql.includes("current_setting('server_version_num')")) {
                return [{
                    version_num: 160000,
                    database_name: 'vpn',
                    database_user: 'app',
                    in_recovery: false,
                    has_random_uuid: true,
                }]
            }
            if (sql.includes('information_schema.tables')) {
                return tables.map((table_name) => ({ table_name }))
            }
            if (sql.includes('required_tables')) {
                return (options.missingContract ?? []).map((missing_object) => ({
                    missing_object,
                }))
            }
            if (sql.includes('FROM yookassa_migrations')) {
                return [{ count: options.historyCount ?? '0' }]
            }
            if (sql.includes('GROUP BY provider')) return []
            if (sql.includes('provider NOT IN')) return [{ count: '0' }]
            if (sql.includes("metadata_snapshot->>'payment_profile'")) return []
            if (sql.includes('projected_merchant')) return []
            if (sql.includes('pg_total_relation_size')) return []
            if (sql.includes('has_schema_privilege')) {
                return [{ schema_usage: true, schema_create: true }]
            }
            throw new Error(`Unexpected SQL: ${sql}`)
        }),
    }
}

describe('YooKassa production preflight schema modes', () => {
    it('accepts synchronize mode with full schema and no migration history requirement', async () => {
        const dataSource = makeDataSource()
        const result = await runYooKassaProductionPreflight(
            dataSource,
            { DB_SYNCHRONIZE: 'true' },
        )
        expect(result.schemaMode).toBe('SYNCHRONIZE')
        expect(result.history).toBe('absent')
        expect(result.yookassaTablesPresent).toBe(3)
    })

    it('reports migration history count without requiring it in synchronize mode', async () => {
        const dataSource = makeDataSource({
            tables: [...CORE_TABLES, ...YK_TABLES, 'yookassa_migrations'],
            historyCount: '7',
        })
        const result = await runYooKassaProductionPreflight(
            dataSource,
            { DB_SYNCHRONIZE: ' TRUE ' },
        )
        expect(result.schemaMode).toBe('SYNCHRONIZE')
        expect(result.migrationHistoryCount).toBe('7')
    })

    it('rejects an incomplete synchronize schema contract', async () => {
        const dataSource = makeDataSource({
            missingContract: ['column:payments.activation_status'],
        })
        await expect(
            runYooKassaProductionPreflight(dataSource, {
                DB_SYNCHRONIZE: 'true',
            }),
        ).rejects.toThrow(
            'YK_SYNCHRONIZE_SCHEMA_CONTRACT_INCOMPLETE:column:payments.activation_status',
        )
        expect(dataSource.destroy).toHaveBeenCalledTimes(1)
    })

    it('preserves migrations mode and rejects partial unmanaged schema', async () => {
        const dataSource = makeDataSource({
            tables: [...CORE_TABLES, 'payment_methods'],
        })
        await expect(
            runYooKassaProductionPreflight(dataSource, {
                DB_SYNCHRONIZE: 'false',
            }),
        ).rejects.toThrow('Partial unmanaged YooKassa schema detected')
    })

    it('preserves the complete migrations mode path when history is present', async () => {
        const dataSource = makeDataSource({
            tables: [...CORE_TABLES, ...YK_TABLES, 'yookassa_migrations'],
            historyCount: '7',
        })
        const result = await runYooKassaProductionPreflight(
            dataSource,
            { DB_SYNCHRONIZE: 'false' },
        )
        expect(result.schemaMode).toBe('MIGRATIONS')
        expect(result.migrationHistoryCount).toBe('7')
    })

    it('does not expose credentials in sanitized output', async () => {
        const result = await runYooKassaProductionPreflight(makeDataSource(), {
            DB_SYNCHRONIZE: 'true',
            DATABASE_PASSWORD: 'do-not-print',
            YOOKASSA_SITE_SECRET_KEY: 'site-secret',
            PLATEGA_SECRET: 'platega-secret',
        })
        const output = JSON.stringify(result)
        expect(output).not.toContain('do-not-print')
        expect(output).not.toContain('site-secret')
        expect(output).not.toContain('platega-secret')
    })
})
