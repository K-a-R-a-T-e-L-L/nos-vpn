import { MigrationInterface, QueryRunner } from 'typeorm'

export class PaymentStage1Architecture202606110001 implements MigrationInterface {
    name = 'PaymentStage1Architecture202606110001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "payments"
                ALTER COLUMN "payment_pay_id" DROP NOT NULL,
                ALTER COLUMN "payment_link" DROP NOT NULL;

            ALTER TABLE "payments"
                ADD COLUMN IF NOT EXISTS "currency" character varying NOT NULL DEFAULT 'RUB',
                ADD COLUMN IF NOT EXISTS "provider" character varying NOT NULL DEFAULT 'platega',
                ADD COLUMN IF NOT EXISTS "user_id" uuid,
                ADD COLUMN IF NOT EXISTS "subscription_id" uuid,
                ADD COLUMN IF NOT EXISTS "plan_id" uuid,
                ADD COLUMN IF NOT EXISTS "provider_payment_id" character varying,
                ADD COLUMN IF NOT EXISTS "provider_invoice_id" character varying,
                ADD COLUMN IF NOT EXISTS "payment_url" text,
                ADD COLUMN IF NOT EXISTS "return_url" text,
                ADD COLUMN IF NOT EXISTS "idempotency_key" character varying,
                ADD COLUMN IF NOT EXISTS "paid_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "failed_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "canceled_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "expired_at" timestamptz;
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'UQ_payments_idempotency_key'
                ) THEN
                    ALTER TABLE "payments"
                    ADD CONSTRAINT "UQ_payments_idempotency_key" UNIQUE ("idempotency_key");
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_payments_provider_payment_id"
            ON "payments" ("provider", "provider_payment_id");
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "provider" character varying NOT NULL,
                "provider_event_id" character varying,
                "provider_payment_id" character varying,
                "event_type" character varying NOT NULL,
                "status" character varying,
                "raw_body" jsonb,
                "headers" jsonb,
                "signature_valid" boolean NOT NULL DEFAULT false,
                "processed" boolean NOT NULL DEFAULT false,
                "processing_error" text,
                "received_at" timestamptz NOT NULL,
                "processed_at" timestamptz,
                "idempotency_key" character varying NOT NULL,
                CONSTRAINT "PK_payment_webhook_events" PRIMARY KEY ("id")
            );
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'UQ_payment_webhook_events_provider_idempotency'
                ) THEN
                    ALTER TABLE "payment_webhook_events"
                    ADD CONSTRAINT "UQ_payment_webhook_events_provider_idempotency"
                    UNIQUE ("provider", "idempotency_key");
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_payment_webhook_events_provider_payment_id"
            ON "payment_webhook_events" ("provider", "provider_payment_id");
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "payment_webhook_events";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_provider_payment_id";`)
        await queryRunner.query(`
            ALTER TABLE "payments"
                DROP COLUMN IF EXISTS "currency",
                DROP COLUMN IF EXISTS "provider",
                DROP COLUMN IF EXISTS "plan_id",
                DROP COLUMN IF EXISTS "provider_payment_id",
                DROP COLUMN IF EXISTS "provider_invoice_id",
                DROP COLUMN IF EXISTS "payment_url",
                DROP COLUMN IF EXISTS "return_url",
                DROP COLUMN IF EXISTS "idempotency_key",
                DROP COLUMN IF EXISTS "paid_at",
                DROP COLUMN IF EXISTS "failed_at",
                DROP COLUMN IF EXISTS "canceled_at",
                DROP COLUMN IF EXISTS "expired_at";
        `)
    }
}
