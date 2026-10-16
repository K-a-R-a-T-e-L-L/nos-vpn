import { MigrationInterface, QueryRunner } from 'typeorm'

export class UserBlockAndAdminOps202606250001 implements MigrationInterface {
    name = 'UserBlockAndAdminOps202606250001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_blocked" boolean NOT NULL DEFAULT false`)
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_at" TIMESTAMPTZ`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "blocked_at"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_blocked"`)
    }
}
