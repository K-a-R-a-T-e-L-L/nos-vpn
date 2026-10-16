import 'dotenv/config'
import { DataSource } from 'typeorm'

import { assertYooKassaMigrationRunnerAllowed } from './yookassa-schema-mode'
import { PaymentLedgerTaxonomy202607280001 } from '../migrations/202607280001-payment-ledger-taxonomy.migration'
import { PaymentMethods202607280002 } from '../migrations/202607280002-payment-methods.migration'
import { SubscriptionRenewals202607280003 } from '../migrations/202607280003-subscription-renewals.migration'
import { PaymentAttempts202607280004 } from '../migrations/202607280004-payment-attempts.migration'
import { YooKassaPaymentProcessing202607280005 } from '../migrations/202607280005-yookassa-payment-processing.migration'
import { SubscriptionAutoRenew202607280006 } from '../migrations/202607280006-subscription-auto-renew.migration'
import { PaymentMethodDisplayFields202607280007 } from '../migrations/202607280007-payment-method-display-fields.migration'

assertYooKassaMigrationRunnerAllowed(process.env.DB_SYNCHRONIZE)
export const yookassaMigrationDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_DB,
    entities: [__dirname + '/../**/*.entity.{ts,js}'],
    migrations: [
        PaymentLedgerTaxonomy202607280001,
        PaymentMethods202607280002,
        SubscriptionRenewals202607280003,
        PaymentAttempts202607280004,
        YooKassaPaymentProcessing202607280005,
        SubscriptionAutoRenew202607280006,
        PaymentMethodDisplayFields202607280007,
    ],
    migrationsTableName: 'yookassa_migrations',
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    logging: ['migration', 'error'],
})

export default yookassaMigrationDataSource
