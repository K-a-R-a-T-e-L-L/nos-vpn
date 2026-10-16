import { MigrationInterface, QueryRunner } from 'typeorm'

export class TelegramSiteLinkAndTempWebCredentials202606300001 implements MigrationInterface {
    name = 'TelegramSiteLinkAndTempWebCredentials202606300001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
                ADD COLUMN IF NOT EXISTS "has_temporary_web_credentials" boolean NOT NULL DEFAULT false;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "telegram_site_link_requests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "code_hash" character varying NOT NULL,
                "telegram_id" bigint NOT NULL,
                "telegram_username" character varying,
                "telegram_first_name" character varying,
                "telegram_last_name" character varying,
                "telegram_is_premium" boolean,
                "telegram_language_code" character varying,
                "expires_at" timestamptz NOT NULL,
                "consumed_at" timestamptz,
                "linked_user_id" uuid,
                CONSTRAINT "PK_telegram_site_link_requests_id" PRIMARY KEY ("id")
            );
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_telegram_site_link_requests_code_hash"
            ON "telegram_site_link_requests" ("code_hash");
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_telegram_site_link_requests_telegram_id"
            ON "telegram_site_link_requests" ("telegram_id");
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_telegram_site_link_requests_linked_user_id"
            ON "telegram_site_link_requests" ("linked_user_id");
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_telegram_site_link_requests_linked_user_id'
                ) THEN
                    ALTER TABLE "telegram_site_link_requests"
                    ADD CONSTRAINT "FK_telegram_site_link_requests_linked_user_id"
                    FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
                END IF;
            END
            $$;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "telegram_site_link_requests" DROP CONSTRAINT IF EXISTS "FK_telegram_site_link_requests_linked_user_id"`,
        )
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_telegram_site_link_requests_linked_user_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_telegram_site_link_requests_telegram_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_telegram_site_link_requests_code_hash"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "telegram_site_link_requests"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "has_temporary_web_credentials"`)
    }
}
