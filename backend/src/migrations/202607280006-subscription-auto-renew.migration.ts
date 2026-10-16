import { MigrationInterface, QueryRunner } from 'typeorm'

export class SubscriptionAutoRenew202607280006 implements MigrationInterface {
    name = 'SubscriptionAutoRenew202607280006'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_auto_renew_status_enum') THEN
                    CREATE TYPE subscription_auto_renew_status_enum AS ENUM
                        ('DISABLED','ACTIVE','RETRY_SCHEDULED','MANUAL_ACTION_REQUIRED');
                END IF;
            END $$;
            ALTER TABLE "subscriptions"
                ADD COLUMN IF NOT EXISTS "auto_renew_enabled" boolean NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS "auto_renew_status" subscription_auto_renew_status_enum NOT NULL DEFAULT 'DISABLED',
                ADD COLUMN IF NOT EXISTS "auto_renew_merchant" payment_merchant_enum,
                ADD COLUMN IF NOT EXISTS "auto_renew_payment_method_id" uuid,
                ADD COLUMN IF NOT EXISTS "auto_renew_enabled_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "auto_renew_canceled_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "next_payment_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "last_payment_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "auto_renew_failure_count" integer NOT NULL DEFAULT 0;
            ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_auto_renew_method"
                FOREIGN KEY ("auto_renew_payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL;
            CREATE INDEX "IDX_subscriptions_auto_renew_due"
                ON "subscriptions" ("auto_renew_enabled","auto_renew_status","next_payment_at","id");
            CREATE INDEX "IDX_subscriptions_auto_renew_method"
                ON "subscriptions" ("auto_renew_payment_method_id","auto_renew_enabled");
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const rows: Array<{ exists: boolean }> = await queryRunner.query(
            `SELECT EXISTS (SELECT 1 FROM "subscriptions" WHERE "auto_renew_enabled" = true) AS "exists"`,
        )
        if (rows[0]?.exists) throw new Error('Cannot revert while auto-renew is enabled')
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_subscriptions_auto_renew_method";
            DROP INDEX IF EXISTS "IDX_subscriptions_auto_renew_due";
            ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "FK_subscriptions_auto_renew_method";
            ALTER TABLE "subscriptions"
                DROP COLUMN IF EXISTS "auto_renew_failure_count",
                DROP COLUMN IF EXISTS "last_payment_at",
                DROP COLUMN IF EXISTS "next_payment_at",
                DROP COLUMN IF EXISTS "auto_renew_canceled_at",
                DROP COLUMN IF EXISTS "auto_renew_enabled_at",
                DROP COLUMN IF EXISTS "auto_renew_payment_method_id",
                DROP COLUMN IF EXISTS "auto_renew_merchant",
                DROP COLUMN IF EXISTS "auto_renew_status",
                DROP COLUMN IF EXISTS "auto_renew_enabled";
            DROP TYPE IF EXISTS subscription_auto_renew_status_enum;
        `)
    }
}
