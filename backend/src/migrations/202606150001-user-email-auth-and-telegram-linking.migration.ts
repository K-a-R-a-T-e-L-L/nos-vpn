import { MigrationInterface, QueryRunner } from 'typeorm'

export class UserEmailAuthAndTelegramLinking202606150001 implements MigrationInterface {
    name = 'UserEmailAuthAndTelegramLinking202606150001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
                ADD COLUMN IF NOT EXISTS "email" character varying,
                ADD COLUMN IF NOT EXISTS "password_hash" character varying,
                ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "telegram_linked_at" timestamptz,
                ADD COLUMN IF NOT EXISTS "telegram_link_token_hash" character varying,
                ADD COLUMN IF NOT EXISTS "telegram_link_token_expires_at" timestamptz;
        `)

        await queryRunner.query(`
            ALTER TABLE "users"
                ALTER COLUMN "telegram_id" DROP NOT NULL,
                ALTER COLUMN "telegram_first_name" DROP NOT NULL;
        `)

        await queryRunner.query(`
            UPDATE "users"
            SET "telegram_linked_at" = COALESCE("telegram_linked_at", "created_at")
            WHERE "telegram_id" IS NOT NULL;
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email"
            ON "users" ("email")
            WHERE "email" IS NOT NULL;
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_users_telegram_link_token_hash"
            ON "users" ("telegram_link_token_hash")
            WHERE "telegram_link_token_hash" IS NOT NULL;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_telegram_link_token_hash"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email"`)
        await queryRunner.query(`
            ALTER TABLE "users"
                DROP COLUMN IF EXISTS "telegram_link_token_expires_at",
                DROP COLUMN IF EXISTS "telegram_link_token_hash",
                DROP COLUMN IF EXISTS "telegram_linked_at",
                DROP COLUMN IF EXISTS "email_verified_at",
                DROP COLUMN IF EXISTS "password_hash",
                DROP COLUMN IF EXISTS "email";
        `)
    }
}
