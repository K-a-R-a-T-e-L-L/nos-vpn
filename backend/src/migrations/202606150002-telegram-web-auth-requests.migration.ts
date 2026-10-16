import { MigrationInterface, QueryRunner } from 'typeorm'

export class TelegramWebAuthRequests202606150002 implements MigrationInterface {
    name = 'TelegramWebAuthRequests202606150002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "telegram_auth_requests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "request_token_hash" character varying NOT NULL,
                "bot_token_hash" character varying NOT NULL,
                "expires_at" timestamptz NOT NULL,
                "confirmed_at" timestamptz,
                "consumed_at" timestamptz,
                "user_id" uuid,
                CONSTRAINT "PK_telegram_auth_requests_id" PRIMARY KEY ("id")
            );
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_telegram_auth_request_token_hash"
            ON "telegram_auth_requests" ("request_token_hash");
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_telegram_auth_bot_token_hash"
            ON "telegram_auth_requests" ("bot_token_hash");
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_telegram_auth_requests_user_id'
                ) THEN
                    ALTER TABLE "telegram_auth_requests"
                    ADD CONSTRAINT "FK_telegram_auth_requests_user_id"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
                END IF;
            END
            $$;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "telegram_auth_requests" DROP CONSTRAINT IF EXISTS "FK_telegram_auth_requests_user_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_telegram_auth_bot_token_hash"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_telegram_auth_request_token_hash"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "telegram_auth_requests"`)
    }
}
