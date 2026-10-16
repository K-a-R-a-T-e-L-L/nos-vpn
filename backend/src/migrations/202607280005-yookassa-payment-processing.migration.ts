import { MigrationInterface, QueryRunner } from 'typeorm'

export class YooKassaPaymentProcessing202607280005 implements MigrationInterface {
    name = 'YooKassaPaymentProcessing202607280005'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_activation_status_enum') THEN
                    CREATE TYPE payment_activation_status_enum AS ENUM
                        ('PENDING','PROCESSING','SUCCEEDED','FAILED_RETRYABLE','FAILED_TERMINAL');
                END IF;
            END $$;
            ALTER TABLE "payments"
                ADD COLUMN IF NOT EXISTS "activation_status" payment_activation_status_enum,
                ADD COLUMN IF NOT EXISTS "activation_lease_token" uuid,
                ADD COLUMN IF NOT EXISTS "activation_lease_expires_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "activation_attempt_count" integer NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "activation_error_code" varchar,
                ADD COLUMN IF NOT EXISTS "activation_error_message" text,
                ADD COLUMN IF NOT EXISTS "processed_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "payment_method_id" uuid,
                ADD COLUMN IF NOT EXISTS "is_recurring" boolean NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS "parent_payment_id" uuid,
                ADD COLUMN IF NOT EXISTS "billing_period_key" varchar(64);
            ALTER TABLE "payments"
                ADD CONSTRAINT "FK_payments_payment_method"
                    FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL,
                ADD CONSTRAINT "FK_payments_parent"
                    FOREIGN KEY ("parent_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL;
            CREATE INDEX "IDX_payments_activation_retry"
                ON "payments" ("activation_status","activation_lease_expires_at","id");
            CREATE INDEX "IDX_payments_payment_method" ON "payments" ("payment_method_id","status");
            CREATE INDEX "IDX_payments_parent" ON "payments" ("parent_payment_id");
            CREATE UNIQUE INDEX "UQ_payments_yookassa_provider_payment"
                ON "payments" ("provider","merchant","provider_payment_id")
                WHERE "provider" = 'yookassa' AND "merchant" IS NOT NULL
                  AND "provider_payment_id" IS NOT NULL AND "deleted_at" IS NULL;
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const rows: Array<{ exists: boolean }> = await queryRunner.query(
            `SELECT EXISTS (
                SELECT 1 FROM "payments"
                WHERE "processed_at" IS NOT NULL OR "payment_method_id" IS NOT NULL OR "parent_payment_id" IS NOT NULL
            ) AS "exists"`,
        )
        if (rows[0]?.exists) throw new Error('Cannot revert populated YooKassa payment processing ledger')
        await queryRunner.query(`
            DROP INDEX IF EXISTS "UQ_payments_yookassa_provider_payment";
            DROP INDEX IF EXISTS "IDX_payments_parent";
            DROP INDEX IF EXISTS "IDX_payments_payment_method";
            DROP INDEX IF EXISTS "IDX_payments_activation_retry";
            ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_parent";
            ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_payment_method";
            ALTER TABLE "payments"
                DROP COLUMN IF EXISTS "billing_period_key",
                DROP COLUMN IF EXISTS "parent_payment_id",
                DROP COLUMN IF EXISTS "is_recurring",
                DROP COLUMN IF EXISTS "payment_method_id",
                DROP COLUMN IF EXISTS "processed_at",
                DROP COLUMN IF EXISTS "activation_error_message",
                DROP COLUMN IF EXISTS "activation_error_code",
                DROP COLUMN IF EXISTS "activation_attempt_count",
                DROP COLUMN IF EXISTS "activation_lease_expires_at",
                DROP COLUMN IF EXISTS "activation_lease_token",
                DROP COLUMN IF EXISTS "activation_status";
            DROP TYPE IF EXISTS payment_activation_status_enum;
        `)
    }
}
