import { MigrationInterface, QueryRunner } from 'typeorm'

export class SubscriptionRenewals202607280003 implements MigrationInterface {
    name = 'SubscriptionRenewals202607280003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_renewal_status_enum') THEN
                    CREATE TYPE subscription_renewal_status_enum AS ENUM (
                        'PLANNED', 'IN_PROGRESS', 'PENDING', 'SUCCEEDED', 'FAILED', 'MANUAL_ACTION_REQUIRED', 'CANCELED'
                    );
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "subscription_renewals" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "subscription_id" uuid NOT NULL,
                "payment_method_id" uuid,
                "merchant" payment_merchant_enum NOT NULL,
                "period_start" timestamptz NOT NULL,
                "period_end" timestamptz NOT NULL,
                "billing_period_key" character varying(64) NOT NULL,
                "status" subscription_renewal_status_enum NOT NULL DEFAULT 'PLANNED',
                "attempt_count" integer NOT NULL DEFAULT 0,
                "next_attempt_at" timestamptz,
                "succeeded_payment_id" uuid,
                "failure_code" character varying,
                "failure_message" text,
                CONSTRAINT "PK_subscription_renewals" PRIMARY KEY ("id"),
                CONSTRAINT "FK_subscription_renewals_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_subscription_renewals_payment_method" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_subscription_renewals_succeeded_payment" FOREIGN KEY ("succeeded_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL
            );
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_renewals_subscription_period"
            ON "subscription_renewals" ("subscription_id", "billing_period_key");
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_subscription_renewals_status_next_attempt"
            ON "subscription_renewals" ("status", "next_attempt_at", "id");
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_subscription_renewals_payment_method"
            ON "subscription_renewals" ("payment_method_id", "status");
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const result: Array<{ exists: boolean }> = await queryRunner.query(
            `SELECT EXISTS (SELECT 1 FROM "subscription_renewals" LIMIT 1) AS "exists";`,
        )
        if (result[0]?.exists) {
            throw new Error('Cannot revert subscription_renewals while rows exist')
        }

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_renewals_payment_method";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_renewals_status_next_attempt";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_subscription_renewals_subscription_period";`)
        await queryRunner.query(`ALTER TABLE IF EXISTS "subscription_renewals" DROP CONSTRAINT IF EXISTS "FK_subscription_renewals_succeeded_payment";`)
        await queryRunner.query(`ALTER TABLE IF EXISTS "subscription_renewals" DROP CONSTRAINT IF EXISTS "FK_subscription_renewals_payment_method";`)
        await queryRunner.query(`ALTER TABLE IF EXISTS "subscription_renewals" DROP CONSTRAINT IF EXISTS "FK_subscription_renewals_subscription";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "subscription_renewals";`)
        await queryRunner.query(`DROP TYPE IF EXISTS subscription_renewal_status_enum;`)
    }
}
