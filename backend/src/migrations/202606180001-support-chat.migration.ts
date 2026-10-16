import { MigrationInterface, QueryRunner } from 'typeorm'

export class SupportChat202606180001 implements MigrationInterface {
    name = 'SupportChat202606180001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "support_thread" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "user_id" uuid NOT NULL,
                "status" varchar NOT NULL DEFAULT 'OPEN',
                "last_message_at" timestamptz NOT NULL DEFAULT now(),
                "last_user_message_at" timestamptz,
                "last_admin_message_at" timestamptz,
                CONSTRAINT "PK_support_thread_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_support_thread_user_id" UNIQUE ("user_id"),
                CONSTRAINT "FK_support_thread_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "support_message" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "thread_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "admin_user_id" uuid,
                "admin_telegram_id" bigint,
                "author_type" varchar NOT NULL,
                "source" varchar NOT NULL,
                "text" text NOT NULL,
                CONSTRAINT "PK_support_message_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_support_message_thread_id" FOREIGN KEY ("thread_id") REFERENCES "support_thread"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_support_message_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_support_message_admin_user_id" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_thread_last_message_at" ON "support_thread" ("last_message_at")`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_message_thread_created_at" ON "support_message" ("thread_id", "created_at")`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_message_user_id" ON "support_message" ("user_id")`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_message_user_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_message_thread_created_at"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_thread_last_message_at"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "support_message"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "support_thread"`)
    }
}
