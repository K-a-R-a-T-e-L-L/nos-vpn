import { MigrationInterface, QueryRunner } from 'typeorm'

export class AdminPromoFields202606170001 implements MigrationInterface {
    name = 'AdminPromoFields202606170001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "promo_code" ADD COLUMN IF NOT EXISTS "name" varchar NOT NULL DEFAULT ''`)
        await queryRunner.query(`ALTER TABLE "promo_code" ADD COLUMN IF NOT EXISTS "max_uses" int`)
        await queryRunner.query(`ALTER TABLE "promo_code" ADD COLUMN IF NOT EXISTS "duration_days" int NOT NULL DEFAULT 30`)
        await queryRunner.query(`ALTER TABLE "promo_code" ADD COLUMN IF NOT EXISTS "devices_limit" int NOT NULL DEFAULT 1`)
        await queryRunner.query(`ALTER TABLE "promo_code" ADD COLUMN IF NOT EXISTS "starts_at" timestamptz`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "promo_code" DROP COLUMN IF EXISTS "starts_at"`)
        await queryRunner.query(`ALTER TABLE "promo_code" DROP COLUMN IF EXISTS "devices_limit"`)
        await queryRunner.query(`ALTER TABLE "promo_code" DROP COLUMN IF EXISTS "duration_days"`)
        await queryRunner.query(`ALTER TABLE "promo_code" DROP COLUMN IF EXISTS "max_uses"`)
        await queryRunner.query(`ALTER TABLE "promo_code" DROP COLUMN IF EXISTS "name"`)
    }
}
