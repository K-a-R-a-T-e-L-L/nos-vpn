import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource, QueryRunner } from 'typeorm'

import {
    YooKassaSchemaMode,
    resolveYooKassaSchemaMode,
} from './yookassa-schema-mode'

type SchemaContractQuery = Pick<QueryRunner, 'query'>

const SCHEMA_CONTRACT_SQL = `
WITH
required_tables(table_name) AS (
    VALUES
        ('payment_methods'),
        ('payment_attempts'),
        ('subscription_renewals')
),
required_columns(table_name, column_name) AS (
    VALUES
        ('payments', 'kind'),
        ('payments', 'merchant'),
        ('payments', 'activation_status'),
        ('payments', 'activation_lease_token'),
        ('payments', 'activation_lease_expires_at'),
        ('payments', 'activation_attempt_count'),
        ('payments', 'activation_error_code'),
        ('payments', 'activation_error_message'),
        ('payments', 'processed_at'),
        ('payments', 'payment_method_id'),
        ('payments', 'is_recurring'),
        ('payments', 'parent_payment_id'),
        ('payments', 'billing_period_key'),
        ('payment_webhook_events', 'merchant'),
        ('payment_methods', 'id'),
        ('payment_methods', 'created_at'),
        ('payment_methods', 'updated_at'),
        ('payment_methods', 'deleted_at'),
        ('payment_methods', 'user_id'),
        ('payment_methods', 'provider'),
        ('payment_methods', 'merchant'),
        ('payment_methods', 'provider_method_id'),
        ('payment_methods', 'status'),
        ('payment_methods', 'revoked_at'),
        ('payment_methods', 'last_used_at'),
        ('payment_methods', 'method_type'),
        ('payment_methods', 'display_title'),
        ('payment_methods', 'last4'),
        ('payment_attempts', 'id'),
        ('payment_attempts', 'created_at'),
        ('payment_attempts', 'updated_at'),
        ('payment_attempts', 'deleted_at'),
        ('payment_attempts', 'payment_id'),
        ('payment_attempts', 'renewal_id'),
        ('payment_attempts', 'attempt_type'),
        ('payment_attempts', 'attempt_number'),
        ('payment_attempts', 'provider'),
        ('payment_attempts', 'merchant'),
        ('payment_attempts', 'idempotency_key'),
        ('payment_attempts', 'provider_payment_id'),
        ('payment_attempts', 'status'),
        ('payment_attempts', 'retryable'),
        ('payment_attempts', 'error_code'),
        ('payment_attempts', 'error_message'),
        ('payment_attempts', 'next_retry_at'),
        ('payment_attempts', 'started_at'),
        ('payment_attempts', 'finished_at'),
        ('payment_attempts', 'request_snapshot'),
        ('payment_attempts', 'response_snapshot'),
        ('subscription_renewals', 'id'),
        ('subscription_renewals', 'created_at'),
        ('subscription_renewals', 'updated_at'),
        ('subscription_renewals', 'deleted_at'),
        ('subscription_renewals', 'subscription_id'),
        ('subscription_renewals', 'payment_method_id'),
        ('subscription_renewals', 'merchant'),
        ('subscription_renewals', 'period_start'),
        ('subscription_renewals', 'period_end'),
        ('subscription_renewals', 'billing_period_key'),
        ('subscription_renewals', 'status'),
        ('subscription_renewals', 'attempt_count'),
        ('subscription_renewals', 'next_attempt_at'),
        ('subscription_renewals', 'succeeded_payment_id'),
        ('subscription_renewals', 'failure_code'),
        ('subscription_renewals', 'failure_message'),
        ('subscriptions', 'auto_renew_enabled'),
        ('subscriptions', 'auto_renew_status'),
        ('subscriptions', 'auto_renew_merchant'),
        ('subscriptions', 'auto_renew_payment_method_id'),
        ('subscriptions', 'auto_renew_enabled_at'),
        ('subscriptions', 'auto_renew_canceled_at'),
        ('subscriptions', 'next_payment_at'),
        ('subscriptions', 'last_payment_at'),
        ('subscriptions', 'auto_renew_failure_count')
),
required_indexes(index_name) AS (
    VALUES
        ('UQ_payment_methods_provider_merchant_method'),
        ('IDX_payment_methods_user_status'),
        ('UQ_payment_attempts_idempotency_key'),
        ('UQ_payment_attempts_payment_number'),
        ('IDX_payment_attempts_provider_payment'),
        ('IDX_payment_attempts_status_retry'),
        ('IDX_payment_attempts_renewal'),
        ('UQ_subscription_renewals_subscription_period'),
        ('IDX_subscription_renewals_status_next_attempt'),
        ('IDX_subscription_renewals_payment_method'),
        ('IDX_payments_activation_retry'),
        ('IDX_payments_payment_method'),
        ('IDX_payments_parent'),
        ('UQ_payments_yookassa_provider_payment'),
        ('IDX_subscriptions_auto_renew_due'),
        ('IDX_subscriptions_auto_renew_method')
),
required_enums(type_name) AS (
    VALUES
        ('payment_provider_enum'),
        ('payment_merchant_enum'),
        ('payment_kind_enum'),
        ('payment_method_status_enum'),
        ('payment_attempt_status_enum'),
        ('payment_attempt_type_enum'),
        ('subscription_renewal_status_enum'),
        ('payment_activation_status_enum'),
        ('subscription_auto_renew_status_enum')
),
required_fks(
    source_table,
    source_column,
    target_table,
    target_column,
    delete_code,
    technical_name
) AS (
    VALUES
        ('payment_methods', 'user_id', 'users', 'id', 'c', 'fk:payment_methods.user_id->users.id:CASCADE'),
        ('payment_attempts', 'payment_id', 'payments', 'id', 'r', 'fk:payment_attempts.payment_id->payments.id:RESTRICT'),
        ('payment_attempts', 'renewal_id', 'subscription_renewals', 'id', 'n', 'fk:payment_attempts.renewal_id->subscription_renewals.id:SET_NULL'),
        ('subscription_renewals', 'subscription_id', 'subscriptions', 'id', 'r', 'fk:subscription_renewals.subscription_id->subscriptions.id:RESTRICT'),
        ('subscription_renewals', 'payment_method_id', 'payment_methods', 'id', 'n', 'fk:subscription_renewals.payment_method_id->payment_methods.id:SET_NULL'),
        ('subscription_renewals', 'succeeded_payment_id', 'payments', 'id', 'n', 'fk:subscription_renewals.succeeded_payment_id->payments.id:SET_NULL'),
        ('payments', 'payment_method_id', 'payment_methods', 'id', 'n', 'fk:payments.payment_method_id->payment_methods.id:SET_NULL'),
        ('payments', 'parent_payment_id', 'payments', 'id', 'n', 'fk:payments.parent_payment_id->payments.id:SET_NULL'),
        ('subscriptions', 'auto_renew_payment_method_id', 'payment_methods', 'id', 'n', 'fk:subscriptions.auto_renew_payment_method_id->payment_methods.id:SET_NULL')
),
actual_fks AS (
    SELECT
        source.relname AS source_table,
        source_column.attname AS source_column,
        target.relname AS target_table,
        target_column.attname AS target_column,
        constraint_row.confdeltype AS delete_code
    FROM pg_constraint constraint_row
    JOIN pg_class source ON source.oid = constraint_row.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
    JOIN pg_class target ON target.oid = constraint_row.confrelid
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY
        AS source_key(attnum, position) ON true
    JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY
        AS target_key(attnum, position) ON target_key.position = source_key.position
    JOIN pg_attribute source_column
        ON source_column.attrelid = source.oid
       AND source_column.attnum = source_key.attnum
    JOIN pg_attribute target_column
        ON target_column.attrelid = target.oid
       AND target_column.attnum = target_key.attnum
    WHERE constraint_row.contype = 'f'
      AND source_namespace.nspname = current_schema()
),
missing AS (
    SELECT 'table:' || table_name AS missing_object
    FROM required_tables
    WHERE to_regclass(format('%I.%I', current_schema(), table_name)) IS NULL
    UNION ALL
    SELECT 'column:' || required_columns.table_name || '.' || required_columns.column_name
    FROM required_columns
    LEFT JOIN information_schema.columns existing
      ON existing.table_schema = current_schema()
     AND existing.table_name = required_columns.table_name
     AND existing.column_name = required_columns.column_name
    WHERE existing.column_name IS NULL
    UNION ALL
    SELECT 'index:' || required_indexes.index_name
    FROM required_indexes
    LEFT JOIN pg_indexes existing
      ON existing.schemaname = current_schema()
     AND existing.indexname = required_indexes.index_name
    WHERE existing.indexname IS NULL
    UNION ALL
    SELECT 'enum:' || required_enums.type_name
    FROM required_enums
    LEFT JOIN pg_type existing ON existing.typname = required_enums.type_name
    WHERE existing.oid IS NULL
    UNION ALL
    SELECT required_fks.technical_name
    FROM required_fks
    LEFT JOIN actual_fks
      ON actual_fks.source_table = required_fks.source_table
     AND actual_fks.source_column = required_fks.source_column
     AND actual_fks.target_table = required_fks.target_table
     AND actual_fks.target_column = required_fks.target_column
     AND actual_fks.delete_code = required_fks.delete_code
    WHERE actual_fks.source_table IS NULL
)
SELECT missing_object
FROM missing
ORDER BY missing_object
`

const BACKFILL_STATEMENTS = [
    `
        UPDATE payments
        SET kind = 'BONUS_BALANCE'
        WHERE kind IS NULL
          AND provider = 'bonus_balance'
    `,
    `
        UPDATE payments
        SET kind = 'PROMO_DISCOUNT'
        WHERE kind IS NULL
          AND provider = 'promo_discount'
    `,
    `
        UPDATE payments
        SET kind = 'EXTERNAL'
        WHERE kind IS NULL
          AND provider IN ('platega', 'yookassa')
    `,
    `
        UPDATE payments
        SET merchant = 'SITE'
        WHERE merchant IS NULL
          AND kind = 'EXTERNAL'
          AND jsonb_typeof(metadata_snapshot -> 'payment_profile') = 'string'
          AND metadata_snapshot ->> 'payment_profile' = 'web'
    `,
    `
        UPDATE payments
        SET merchant = 'BOT'
        WHERE merchant IS NULL
          AND kind = 'EXTERNAL'
          AND jsonb_typeof(metadata_snapshot -> 'payment_profile') = 'string'
          AND metadata_snapshot ->> 'payment_profile' = 'bot'
    `,
]

export async function findMissingYooKassaSchemaObjects(
    queryable: SchemaContractQuery,
): Promise<string[]> {
    const rows: Array<{ missing_object: string }> =
        await queryable.query(SCHEMA_CONTRACT_SQL)
    return rows.map((row) => row.missing_object)
}

export async function assertYooKassaSchemaContract(
    queryable: SchemaContractQuery,
): Promise<void> {
    const missing = await findMissingYooKassaSchemaObjects(queryable)
    if (missing.length > 0) {
        throw new Error(
            `YK_SYNCHRONIZE_SCHEMA_CONTRACT_INCOMPLETE:${missing.join(',')}`,
        )
    }
}

@Injectable()
export class YooKassaSynchronizeBootstrapService
    implements OnApplicationBootstrap
{
    private readonly logger = new Logger(
        YooKassaSynchronizeBootstrapService.name,
    )

    constructor(
        private readonly dataSource: DataSource,
        private readonly configService: ConfigService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (
            resolveYooKassaSchemaMode(
                this.configService.get<string | boolean>('DB_SYNCHRONIZE'),
            ) !== YooKassaSchemaMode.SYNCHRONIZE
        ) {
            return
        }

        const queryRunner = this.dataSource.createQueryRunner()
        let lockAcquired = false
        await queryRunner.connect()
        try {
            await queryRunner.query(`
                SELECT pg_advisory_lock(
                    hashtext('nosvpn:yookassa:synchronize-bootstrap')
                )
            `)
            lockAcquired = true
            await assertYooKassaSchemaContract(queryRunner)

            for (const [index, statement] of BACKFILL_STATEMENTS.entries()) {
                const result = await queryRunner.query(
                    statement,
                    undefined,
                    true,
                )
                this.logger.log({
                    event: 'yookassa synchronize compatibility backfill',
                    statement: index + 1,
                    affected: Number(result?.affected ?? 0),
                })
            }
        } finally {
            try {
                if (lockAcquired) {
                    await queryRunner.query(`
                        SELECT pg_advisory_unlock(
                            hashtext('nosvpn:yookassa:synchronize-bootstrap')
                        )
                    `)
                }
            } finally {
                await queryRunner.release()
            }
        }
    }
}
