import { MigrationInterface, QueryRunner } from 'typeorm'

export class LifecycleWiring202605240002 implements MigrationInterface {
    name = 'LifecycleWiring202605240002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promo_code_type_enum') THEN
                    CREATE TYPE "promo_code_type_enum" AS ENUM('FIRST_PAYMENT_PERCENT');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promo_code_status_enum') THEN
                    CREATE TYPE "promo_code_status_enum" AS ENUM('ACTIVE', 'INACTIVE');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "promo_code" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ,
                "code" character varying NOT NULL,
                "type" "promo_code_type_enum" NOT NULL DEFAULT 'FIRST_PAYMENT_PERCENT',
                "value_percent" integer NOT NULL,
                "status" "promo_code_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "expires_at" TIMESTAMPTZ NOT NULL,
                CONSTRAINT "PK_promo_code_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_promo_code_code" UNIQUE ("code")
            )
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promo_usage_status_enum') THEN
                    CREATE TYPE "promo_usage_status_enum" AS ENUM('RESERVED', 'APPLIED', 'CANCELED');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "promo_usage" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ,
                "promo_code_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "status" "promo_usage_status_enum" NOT NULL DEFAULT 'RESERVED',
                "applied_at" TIMESTAMPTZ,
                CONSTRAINT "PK_promo_usage_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_promo_usage_code" FOREIGN KEY ("promo_code_id") REFERENCES "promo_code"("id") ON DELETE NO ACTION,
                CONSTRAINT "FK_promo_usage_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION
            )
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_promo_usage_user_code"
            ON "promo_usage" ("promo_code_id", "user_id")
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_bonus_ledger_status_enum') THEN
                    CREATE TYPE "referral_bonus_ledger_status_enum" AS ENUM('PENDING_WINDOW', 'AWARDED', 'REJECTED');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "referral_bonus_ledger" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ,
                "referrer_user_id" uuid NOT NULL,
                "referred_user_id" uuid NOT NULL,
                "subscription_id" uuid,
                "bonus_days" integer NOT NULL DEFAULT 7,
                "status" "referral_bonus_ledger_status_enum" NOT NULL DEFAULT 'PENDING_WINDOW',
                "eligible_at" TIMESTAMPTZ NOT NULL,
                "awarded_at" TIMESTAMPTZ,
                CONSTRAINT "PK_referral_bonus_ledger_id" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_referral_bonus_once_per_invited"
            ON "referral_bonus_ledger" ("referred_user_id")
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payments_external_event_id"
            ON "payments" ("external_event_id")
            WHERE "external_event_id" IS NOT NULL
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_payments_external_event_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_referral_bonus_once_per_invited"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "referral_bonus_ledger"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "referral_bonus_ledger_status_enum"`)

        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_promo_usage_user_code"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "promo_usage"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "promo_usage_status_enum"`)

        await queryRunner.query(`DROP TABLE IF EXISTS "promo_code"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "promo_code_status_enum"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "promo_code_type_enum"`)
    }
}
