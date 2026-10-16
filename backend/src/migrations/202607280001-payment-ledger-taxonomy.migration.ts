import { MigrationInterface, QueryRunner } from 'typeorm'

export class PaymentLedgerTaxonomy202607280001 implements MigrationInterface {
    name = 'PaymentLedgerTaxonomy202607280001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider_enum') THEN
                    CREATE TYPE payment_provider_enum AS ENUM ('YOOKASSA', 'PLATEGA');
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_merchant_enum') THEN
                    CREATE TYPE payment_merchant_enum AS ENUM ('SITE', 'BOT');
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_kind_enum') THEN
                    CREATE TYPE payment_kind_enum AS ENUM ('EXTERNAL', 'BONUS_BALANCE', 'PROMO_DISCOUNT');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            ALTER TABLE "payments"
                ADD COLUMN IF NOT EXISTS "kind" payment_kind_enum NULL,
                ADD COLUMN IF NOT EXISTS "merchant" payment_merchant_enum NULL;

            ALTER TABLE "payment_webhook_events"
                ADD COLUMN IF NOT EXISTS "merchant" payment_merchant_enum NULL;
        `)

        await queryRunner.query(`
            UPDATE "payments"
            SET "kind" = 'BONUS_BALANCE'
            WHERE "kind" IS NULL
              AND "provider" = 'bonus_balance';

            UPDATE "payments"
            SET "kind" = 'PROMO_DISCOUNT'
            WHERE "kind" IS NULL
              AND "provider" = 'promo_discount';

            UPDATE "payments"
            SET "kind" = 'EXTERNAL'
            WHERE "kind" IS NULL
              AND "provider" IN ('platega', 'yookassa');

            UPDATE "payments"
            SET "merchant" = 'SITE'
            WHERE "merchant" IS NULL
              AND "kind" = 'EXTERNAL'
              AND jsonb_typeof("metadata_snapshot" -> 'payment_profile') = 'string'
              AND "metadata_snapshot" ->> 'payment_profile' = 'web';

            UPDATE "payments"
            SET "merchant" = 'BOT'
            WHERE "merchant" IS NULL
              AND "kind" = 'EXTERNAL'
              AND jsonb_typeof("metadata_snapshot" -> 'payment_profile') = 'string'
              AND "metadata_snapshot" ->> 'payment_profile' = 'bot';
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "merchant";`)
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "merchant";`)
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "kind";`)
        await queryRunner.query(`DROP TYPE IF EXISTS payment_kind_enum;`)
        await queryRunner.query(`DROP TYPE IF EXISTS payment_merchant_enum;`)
        await queryRunner.query(`DROP TYPE IF EXISTS payment_provider_enum;`)
    }
}
