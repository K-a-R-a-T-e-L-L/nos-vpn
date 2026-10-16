import { MigrationInterface, QueryRunner } from 'typeorm'

export class ReferralEveryPaymentPercent202606130001 implements MigrationInterface {
    name = 'ReferralEveryPaymentPercent202606130001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_referral_bonus_once_per_invited"`)

        await queryRunner.query(`
            ALTER TABLE "users"
                ALTER COLUMN "referral_bonus_balance_rub" TYPE numeric(12, 2)
                    USING "referral_bonus_balance_rub"::numeric(12, 2),
                ALTER COLUMN "referral_bonus_balance_rub" SET DEFAULT 0,
                ALTER COLUMN "total_referral_bonus_rub" TYPE numeric(12, 2)
                    USING "total_referral_bonus_rub"::numeric(12, 2),
                ALTER COLUMN "total_referral_bonus_rub" SET DEFAULT 0;
        `)

        await queryRunner.query(`
            ALTER TABLE "referral_bonus_ledger"
                ADD COLUMN IF NOT EXISTS "payment_id" uuid,
                ADD COLUMN IF NOT EXISTS "bonus_percent" integer NOT NULL DEFAULT 50;
        `)

        await queryRunner.query(`
            ALTER TABLE "referral_bonus_ledger"
                ALTER COLUMN "bonus_rub" TYPE numeric(12, 2)
                    USING "bonus_rub"::numeric(12, 2),
                ALTER COLUMN "bonus_rub" SET DEFAULT 0,
                ALTER COLUMN "bonus_rub" SET NOT NULL;
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_referral_bonus_referred_user"
            ON "referral_bonus_ledger" ("referred_user_id");
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_referral_bonus_payment"
            ON "referral_bonus_ledger" ("payment_id")
            WHERE "payment_id" IS NOT NULL;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_referral_bonus_payment"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referral_bonus_referred_user"`)

        await queryRunner.query(`
            ALTER TABLE "referral_bonus_ledger"
                DROP COLUMN IF EXISTS "bonus_percent",
                DROP COLUMN IF EXISTS "payment_id";
        `)

        await queryRunner.query(`
            ALTER TABLE "referral_bonus_ledger"
                ALTER COLUMN "bonus_rub" TYPE integer
                    USING ROUND("bonus_rub")::integer,
                ALTER COLUMN "bonus_rub" SET DEFAULT 100,
                ALTER COLUMN "bonus_rub" SET NOT NULL;
        `)

        await queryRunner.query(`
            ALTER TABLE "users"
                ALTER COLUMN "referral_bonus_balance_rub" TYPE integer
                    USING ROUND("referral_bonus_balance_rub")::integer,
                ALTER COLUMN "referral_bonus_balance_rub" SET DEFAULT 0,
                ALTER COLUMN "total_referral_bonus_rub" TYPE integer
                    USING ROUND("total_referral_bonus_rub")::integer,
                ALTER COLUMN "total_referral_bonus_rub" SET DEFAULT 0;
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_referral_bonus_once_per_invited"
            ON "referral_bonus_ledger" ("referred_user_id");
        `)
    }
}
