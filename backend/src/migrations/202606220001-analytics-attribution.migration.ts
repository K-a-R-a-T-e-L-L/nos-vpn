import { MigrationInterface, QueryRunner } from 'typeorm'

export class AnalyticsAttribution202606220001 implements MigrationInterface {
    name = 'AnalyticsAttribution202606220001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "traffic_source" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "code" varchar NOT NULL,
                "name" varchar NOT NULL,
                "description" text,
                "website_path" varchar NOT NULL DEFAULT '/earn',
                "is_active" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_traffic_source_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_traffic_source_code" UNIQUE ("code")
            )
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "user_attribution" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "user_id" uuid NOT NULL,
                "source_id" uuid,
                "source_code_snapshot" varchar,
                "entry_point" varchar,
                "landing_path" text,
                "claimed_at" timestamptz,
                "bot_started_at" timestamptz,
                "trial_started_at" timestamptz,
                "access_viewed_at" timestamptz,
                "qr_opened_at" timestamptz,
                "first_payment_at" timestamptz,
                "first_post_trial_payment_at" timestamptz,
                "first_plan_id" uuid,
                "latest_plan_id" uuid,
                CONSTRAINT "PK_user_attribution_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_user_attribution_user_id" UNIQUE ("user_id"),
                CONSTRAINT "FK_user_attribution_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_user_attribution_source_id" FOREIGN KEY ("source_id") REFERENCES "traffic_source"("id") ON DELETE SET NULL
            )
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "analytics_event" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "user_id" uuid,
                "source_id" uuid,
                "event_type" varchar NOT NULL,
                "amount_rub" numeric(12,2),
                "metadata" jsonb,
                "occurred_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_analytics_event_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_analytics_event_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_analytics_event_source_id" FOREIGN KEY ("source_id") REFERENCES "traffic_source"("id") ON DELETE SET NULL
            )
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_attribution_source_id" ON "user_attribution" ("source_id")`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_user_id" ON "analytics_event" ("user_id")`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_source_id" ON "analytics_event" ("source_id")`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_type_occurred_at" ON "analytics_event" ("event_type", "occurred_at")`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analytics_event_type_occurred_at"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analytics_event_source_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analytics_event_user_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_attribution_source_id"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "analytics_event"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "user_attribution"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "traffic_source"`)
    }
}
