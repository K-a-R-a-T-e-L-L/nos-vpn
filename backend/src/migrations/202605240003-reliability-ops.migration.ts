import { MigrationInterface, QueryRunner } from 'typeorm'

export class ReliabilityOps202605240003 implements MigrationInterface {
    name = 'ReliabilityOps202605240003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "vpn_access"
            ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMPTZ
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_operation_log_operation_type_enum') THEN
                    CREATE TYPE "access_operation_log_operation_type_enum" AS ENUM('ENSURE', 'EXTEND', 'DISABLE', 'RECONCILE');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_operation_log_status_enum') THEN
                    CREATE TYPE "access_operation_log_status_enum" AS ENUM('STARTED', 'SUCCESS', 'FAILED');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "access_operation_log" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ,
                "operation_key" character varying NOT NULL,
                "operation_type" "access_operation_log_operation_type_enum" NOT NULL,
                "subscription_id" uuid,
                "access_id" uuid,
                "provider_type" "vpn_access_provider_type_enum" NOT NULL,
                "status" "access_operation_log_status_enum" NOT NULL DEFAULT 'STARTED',
                "started_at" TIMESTAMPTZ,
                "finished_at" TIMESTAMPTZ,
                "error" text,
                "result_snapshot" jsonb,
                CONSTRAINT "PK_access_operation_log_id" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_access_operation_key"
            ON "access_operation_log" ("operation_key")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_access_operation_key"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "access_operation_log"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "access_operation_log_status_enum"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "access_operation_log_operation_type_enum"`)

        await queryRunner.query(`ALTER TABLE "vpn_access" DROP COLUMN IF EXISTS "next_retry_at"`)
        await queryRunner.query(`ALTER TABLE "vpn_access" DROP COLUMN IF EXISTS "retry_count"`)
    }
}
