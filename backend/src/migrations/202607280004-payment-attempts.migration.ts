import { MigrationInterface, QueryRunner } from 'typeorm'

export class PaymentAttempts202607280004 implements MigrationInterface {
    name = 'PaymentAttempts202607280004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempt_status_enum') THEN
                    CREATE TYPE payment_attempt_status_enum AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempt_type_enum') THEN
                    CREATE TYPE payment_attempt_type_enum AS ENUM ('INITIAL', 'RECURRENT');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "payment_attempts" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "payment_id" uuid NOT NULL,
                "renewal_id" uuid,
                "attempt_type" payment_attempt_type_enum NOT NULL DEFAULT 'INITIAL',
                "attempt_number" integer NOT NULL DEFAULT 1,
                "provider" payment_provider_enum NOT NULL,
                "merchant" payment_merchant_enum NOT NULL,
                "idempotency_key" character varying NOT NULL,
                "provider_payment_id" character varying,
                "status" payment_attempt_status_enum NOT NULL DEFAULT 'CREATED',
                "retryable" boolean NOT NULL DEFAULT false,
                "error_code" character varying,
                "error_message" text,
                "next_retry_at" timestamptz,
                "started_at" timestamptz,
                "finished_at" timestamptz,
                "request_snapshot" jsonb,
                "response_snapshot" jsonb,
                CONSTRAINT "PK_payment_attempts" PRIMARY KEY ("id"),
                CONSTRAINT "FK_payment_attempts_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_payment_attempts_renewal" FOREIGN KEY ("renewal_id") REFERENCES "subscription_renewals"("id") ON DELETE SET NULL
            );
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_attempts_idempotency_key"
            ON "payment_attempts" ("idempotency_key");
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_attempts_payment_number"
            ON "payment_attempts" ("payment_id", "attempt_number");
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_payment_attempts_provider_payment"
            ON "payment_attempts" ("provider", "merchant", "provider_payment_id");
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_payment_attempts_status_retry"
            ON "payment_attempts" ("status", "next_retry_at", "id");
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_payment_attempts_renewal"
            ON "payment_attempts" ("renewal_id", "attempt_number");
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const result: Array<{ exists: boolean }> = await queryRunner.query(
            `SELECT EXISTS (SELECT 1 FROM "payment_attempts" LIMIT 1) AS "exists";`,
        )
        if (result[0]?.exists) {
            throw new Error('Cannot revert payment_attempts while rows exist')
        }

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_attempts_renewal";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_attempts_status_retry";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_attempts_provider_payment";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_payment_attempts_payment_number";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_payment_attempts_idempotency_key";`)
        await queryRunner.query(`ALTER TABLE IF EXISTS "payment_attempts" DROP CONSTRAINT IF EXISTS "FK_payment_attempts_renewal";`)
        await queryRunner.query(`ALTER TABLE IF EXISTS "payment_attempts" DROP CONSTRAINT IF EXISTS "FK_payment_attempts_payment";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "payment_attempts";`)
        await queryRunner.query(`DROP TYPE IF EXISTS payment_attempt_type_enum;`)
        await queryRunner.query(`DROP TYPE IF EXISTS payment_attempt_status_enum;`)
    }
}
