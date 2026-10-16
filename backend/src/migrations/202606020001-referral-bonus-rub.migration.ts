import { MigrationInterface, QueryRunner } from 'typeorm'

export class ReferralBonusRub202606020001 implements MigrationInterface {
    name = 'ReferralBonusRub202606020001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'referral_bonus_ledger'
                ) THEN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'referral_bonus_ledger'
                          AND column_name = 'bonus_days'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'referral_bonus_ledger'
                          AND column_name = 'bonus_rub'
                    ) THEN
                        ALTER TABLE "referral_bonus_ledger" RENAME COLUMN "bonus_days" TO "bonus_rub";
                    ELSIF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'referral_bonus_ledger'
                          AND column_name = 'bonus_rub'
                    ) THEN
                        ALTER TABLE "referral_bonus_ledger" ADD COLUMN "bonus_rub" integer NOT NULL DEFAULT 100;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'referral_bonus_ledger'
                          AND column_name = 'bonus_days'
                    ) THEN
                        ALTER TABLE "referral_bonus_ledger" DROP COLUMN "bonus_days";
                    END IF;

                    UPDATE "referral_bonus_ledger"
                    SET "bonus_rub" = 100
                    WHERE "bonus_rub" IS NULL;

                    ALTER TABLE "referral_bonus_ledger" ALTER COLUMN "bonus_rub" SET DEFAULT 100;
                    ALTER TABLE "referral_bonus_ledger" ALTER COLUMN "bonus_rub" SET NOT NULL;
                END IF;
            END
            $$;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'referral_bonus_ledger'
                ) AND EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'referral_bonus_ledger'
                      AND column_name = 'bonus_rub'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'referral_bonus_ledger'
                      AND column_name = 'bonus_days'
                ) THEN
                    ALTER TABLE "referral_bonus_ledger" RENAME COLUMN "bonus_rub" TO "bonus_days";
                    ALTER TABLE "referral_bonus_ledger" ALTER COLUMN "bonus_days" SET DEFAULT 7;
                END IF;
            END
            $$;
        `)
    }
}
