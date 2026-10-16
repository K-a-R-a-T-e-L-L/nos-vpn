import { readFileSync } from 'fs'
import { join } from 'path'

describe('YooKassa dedicated migration data source', () => {
    const originalDbSynchronize = process.env.DB_SYNCHRONIZE

    afterEach(() => {
        jest.resetModules()
        if (originalDbSynchronize === undefined) delete process.env.DB_SYNCHRONIZE
        else process.env.DB_SYNCHRONIZE = originalDbSynchronize
    })

    it('uses only the explicit additive YooKassa migration chain', () => {
        process.env.DB_SYNCHRONIZE = 'false'
        const {
            default: yookassaMigrationDataSource,
            yookassaMigrationDataSource: namedDataSource,
        } = require('./yookassa-migration.datasource')
        expect(namedDataSource).toBe(yookassaMigrationDataSource)
        expect(yookassaMigrationDataSource.options.synchronize).toBe(false)
        expect(yookassaMigrationDataSource.options.migrationsRun).toBe(false)
        expect(
            (yookassaMigrationDataSource.options as { installExtensions?: boolean }).installExtensions,
        ).toBe(false)
        expect(yookassaMigrationDataSource.options.migrationsTableName).toBe('yookassa_migrations')
        expect(
            (yookassaMigrationDataSource.options.migrations as Array<{ name?: string }>).map(
                (migration) => migration.name,
            ),
        ).toEqual([
            'PaymentLedgerTaxonomy202607280001',
            'PaymentMethods202607280002',
            'SubscriptionRenewals202607280003',
            'PaymentAttempts202607280004',
            'YooKassaPaymentProcessing202607280005',
            'SubscriptionAutoRenew202607280006',
            'PaymentMethodDisplayFields202607280007',
        ])
    })

    it('uses gen_random_uuid and never imports the historical migration chain', () => {
        const files = ['002-payment-methods', '003-subscription-renewals', '004-payment-attempts']
            .map((suffix) =>
                readFileSync(join(process.cwd(), 'src', 'migrations', `202607280${suffix}.migration.ts`), 'utf8'),
            )
            .join('\n')
        const dataSource = readFileSync(
            join(process.cwd(), 'src', 'database', 'yookassa-migration.datasource.ts'),
            'utf8',
        )
        expect(files).not.toContain('uuid_generate_v4')
        expect(files).toContain('gen_random_uuid()')
        expect(dataSource).not.toContain('202605')
        expect(dataSource).not.toContain('202606')
        expect(dataSource).not.toContain('synchronize: true')
    })

    it('rejects synchronize mode before constructing the DataSource', () => {
        process.env.DB_SYNCHRONIZE = 'true'
        const dataSource = readFileSync(
            join(process.cwd(), 'src', 'database', 'yookassa-migration.datasource.ts'),
            'utf8',
        )
        expect(dataSource.indexOf('assertYooKassaMigrationRunnerAllowed')).toBeLessThan(
            dataSource.indexOf('new DataSource'),
        )
        expect(() => require('./yookassa-migration.datasource')).toThrow(
            'YK_MIGRATION_RUNNER_DISABLED_WHILE_DB_SYNCHRONIZE_TRUE',
        )
    })
})
