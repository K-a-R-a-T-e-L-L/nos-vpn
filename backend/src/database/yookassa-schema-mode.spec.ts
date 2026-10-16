import { getMetadataArgsStorage } from 'typeorm'

import { buildDataSourceOptions } from '../database.provider'
import { validationSchema } from '../env.validation'
import {
    YooKassaSchemaMode,
    assertYooKassaMigrationRunnerAllowed,
    resolveYooKassaSchemaMode,
} from './yookassa-schema-mode'
import { PaymentAttempt } from '../payment/entity/payment-attempt.entity'
import { PaymentMethod } from '../payment/entity/payment-method.entity'
import { PaymentWebhookEvent } from '../payment/entity/payment-webhook-event.entity'
import { Payment } from '../payment/entity/payment.entity'
import { SubscriptionRenewal } from '../subscription/entity/subscription-renewal.entity'
import { Subscription } from '../subscription/entity/subscription.entity'

describe('YooKassa schema mode', () => {
    it.each([
        [undefined, YooKassaSchemaMode.MIGRATIONS],
        [false, YooKassaSchemaMode.MIGRATIONS],
        ['false', YooKassaSchemaMode.MIGRATIONS],
        ['anything-else', YooKassaSchemaMode.MIGRATIONS],
        [true, YooKassaSchemaMode.SYNCHRONIZE],
        ['true', YooKassaSchemaMode.SYNCHRONIZE],
        [' TRUE ', YooKassaSchemaMode.SYNCHRONIZE],
        ['TrUe', YooKassaSchemaMode.SYNCHRONIZE],
    ])('resolves %p to %s', (value, expected) => {
        expect(resolveYooKassaSchemaMode(value)).toBe(expected)
    })

    it('rejects the migration runner in synchronize mode with the exact code', () => {
        expect(() => assertYooKassaMigrationRunnerAllowed(' true ')).toThrow(
            'YK_MIGRATION_RUNNER_DISABLED_WHILE_DB_SYNCHRONIZE_TRUE',
        )
        expect(() => assertYooKassaMigrationRunnerAllowed(false)).not.toThrow()
    })

    it('keeps the application DataSource controlled by the exact DB_SYNCHRONIZE boolean string', () => {
        const config = {
            get: jest.fn((key: string) => (key === 'DB_SYNCHRONIZE' ? 'true' : undefined)),
        }
        expect(buildDataSourceOptions(config as never).synchronize).toBe(true)
        config.get.mockReturnValue('false')
        expect(buildDataSourceOptions(config as never).synchronize).toBe(false)
    })

    it('defaults DB_SYNCHRONIZE to true while keeping payment flags off', () => {
        const description = validationSchema.describe()
        expect(description.keys.DB_SYNCHRONIZE.flags?.default).toBe('true')
        for (const key of [
            'PAYMENT_YOOKASSA_ENABLED',
            'PAYMENT_YOOKASSA_WEBHOOK_ENABLED',
            'PAYMENT_RECURRENT_ENABLED',
            'PAYMENT_ACTIVATION_RECONCILIATION_ENABLED',
            'PAYMENT_YOOKASSA_STATUS_RECONCILIATION_ENABLED',
            'PAYMENT_YOOKASSA_PRODUCTION_CONFIRMED',
        ]) {
            expect(description.keys[key].flags?.default).toBe('false')
        }
        expect(description.keys.PAYMENT_PRIMARY_PROVIDER.flags?.default).toBe('PLATEGA')
    })
})

describe('YooKassa synchronize entity metadata parity', () => {
    const metadata = getMetadataArgsStorage()

    function indexNames(target: Function): string[] {
        return metadata.indices
            .filter((index) => index.target === target)
            .map((index) => index.name)
            .filter((name): name is string => Boolean(name))
    }

    function columnNames(target: Function): string[] {
        return metadata.columns
            .filter((column) => column.target === target)
            .map((column) => String(column.options.name ?? column.propertyName))
    }

    it('represents all required tables and columns', () => {
        for (const [target, tableName] of [
            [PaymentMethod, 'payment_methods'],
            [PaymentAttempt, 'payment_attempts'],
            [SubscriptionRenewal, 'subscription_renewals'],
        ] as const) {
            expect(
                metadata.tables.find((table) => table.target === target)?.name,
            ).toBe(tableName)
        }

        const requiredColumns = new Map<Function, string[]>([
            [
                Payment,
                [
                    'kind',
                    'merchant',
                    'activation_status',
                    'activation_lease_token',
                    'activation_lease_expires_at',
                    'activation_attempt_count',
                    'activation_error_code',
                    'activation_error_message',
                    'processed_at',
                    'payment_method_id',
                    'is_recurring',
                    'parent_payment_id',
                    'billing_period_key',
                ],
            ],
            [PaymentWebhookEvent, ['merchant']],
            [
                PaymentMethod,
                [
                    'user_id',
                    'provider',
                    'merchant',
                    'provider_method_id',
                    'status',
                    'revoked_at',
                    'last_used_at',
                    'method_type',
                    'display_title',
                    'last4',
                ],
            ],
            [
                PaymentAttempt,
                [
                    'payment_id',
                    'renewal_id',
                    'attempt_type',
                    'attempt_number',
                    'provider',
                    'merchant',
                    'idempotency_key',
                    'provider_payment_id',
                    'status',
                    'retryable',
                    'error_code',
                    'error_message',
                    'next_retry_at',
                    'started_at',
                    'finished_at',
                    'request_snapshot',
                    'response_snapshot',
                ],
            ],
            [
                SubscriptionRenewal,
                [
                    'subscription_id',
                    'payment_method_id',
                    'merchant',
                    'period_start',
                    'period_end',
                    'billing_period_key',
                    'status',
                    'attempt_count',
                    'next_attempt_at',
                    'succeeded_payment_id',
                    'failure_code',
                    'failure_message',
                ],
            ],
            [
                Subscription,
                [
                    'auto_renew_enabled',
                    'auto_renew_status',
                    'auto_renew_merchant',
                    'auto_renew_payment_method_id',
                    'auto_renew_enabled_at',
                    'auto_renew_canceled_at',
                    'next_payment_at',
                    'last_payment_at',
                    'auto_renew_failure_count',
                ],
            ],
        ])

        for (const [target, expected] of requiredColumns) {
            expect(columnNames(target)).toEqual(expect.arrayContaining(expected))
        }
    })

    it('uses explicit stable enum names for synchronize', () => {
        const targets = new Set<Function>([
            Payment,
            PaymentWebhookEvent,
            PaymentMethod,
            PaymentAttempt,
            Subscription,
            SubscriptionRenewal,
        ])
        const enumNames = metadata.columns
            .filter((column) => targets.has(column.target as Function))
            .map((column) => column.options.enumName)
            .filter((name): name is string => Boolean(name))

        expect(enumNames).toEqual(
            expect.arrayContaining([
                'payment_provider_enum',
                'payment_merchant_enum',
                'payment_kind_enum',
                'payment_method_status_enum',
                'payment_attempt_status_enum',
                'payment_attempt_type_enum',
                'subscription_renewal_status_enum',
                'payment_activation_status_enum',
                'subscription_auto_renew_status_enum',
            ]),
        )
    })

    it('represents every required named index', () => {
        expect(indexNames(PaymentMethod)).toEqual(
            expect.arrayContaining([
                'UQ_payment_methods_provider_merchant_method',
                'IDX_payment_methods_user_status',
            ]),
        )
        expect(indexNames(PaymentAttempt)).toEqual(
            expect.arrayContaining([
                'UQ_payment_attempts_idempotency_key',
                'UQ_payment_attempts_payment_number',
                'IDX_payment_attempts_provider_payment',
                'IDX_payment_attempts_status_retry',
                'IDX_payment_attempts_renewal',
            ]),
        )
        expect(indexNames(SubscriptionRenewal)).toEqual(
            expect.arrayContaining([
                'UQ_subscription_renewals_subscription_period',
                'IDX_subscription_renewals_status_next_attempt',
                'IDX_subscription_renewals_payment_method',
            ]),
        )
        expect(indexNames(Payment)).toEqual(
            expect.arrayContaining([
                'IDX_payments_activation_retry',
                'IDX_payments_payment_method',
                'IDX_payments_parent',
                'UQ_payments_yookassa_provider_payment',
            ]),
        )
        expect(indexNames(Subscription)).toEqual(
            expect.arrayContaining([
                'IDX_subscriptions_auto_renew_due',
                'IDX_subscriptions_auto_renew_method',
            ]),
        )
    })

    it('represents the YooKassa partial unique payment identity', () => {
        const index = metadata.indices.find(
            (candidate) =>
                candidate.target === Payment &&
                candidate.name === 'UQ_payments_yookassa_provider_payment',
        )
        expect(index?.unique).toBe(true)
        expect(index?.where).toContain(`"provider" = 'yookassa'`)
        expect(index?.where).toContain('"merchant" IS NOT NULL')
        expect(index?.where).toContain('"provider_payment_id" IS NOT NULL')
        expect(index?.where).toContain('"deleted_at" IS NULL')
    })

    it('represents required relation delete policies', () => {
        const expected = new Map<Function, Record<string, string>>([
            [PaymentMethod, { user: 'CASCADE' }],
            [PaymentAttempt, { payment: 'RESTRICT', renewal: 'SET NULL' }],
            [
                SubscriptionRenewal,
                {
                    subscription: 'RESTRICT',
                    paymentMethod: 'SET NULL',
                    succeededPayment: 'SET NULL',
                },
            ],
            [Payment, { paymentMethod: 'SET NULL', parentPayment: 'SET NULL' }],
            [Subscription, { autoRenewPaymentMethod: 'SET NULL' }],
        ])

        for (const [target, relations] of expected) {
            for (const [property, onDelete] of Object.entries(relations)) {
                const relation = metadata.relations.find(
                    (candidate) =>
                        candidate.target === target && candidate.propertyName === property,
                )
                expect(relation?.options.onDelete).toBe(onDelete)
            }
        }
    })
})
