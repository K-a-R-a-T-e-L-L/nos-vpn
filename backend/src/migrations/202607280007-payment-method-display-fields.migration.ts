import { MigrationInterface, QueryRunner } from 'typeorm'

export class PaymentMethodDisplayFields202607280007 implements MigrationInterface {
    name = 'PaymentMethodDisplayFields202607280007'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "payment_methods"
                ADD COLUMN IF NOT EXISTS "method_type" varchar,
                ADD COLUMN IF NOT EXISTS "display_title" varchar,
                ADD COLUMN IF NOT EXISTS "last4" varchar(4);
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "payment_methods"
                DROP COLUMN IF EXISTS "last4",
                DROP COLUMN IF EXISTS "display_title",
                DROP COLUMN IF EXISTS "method_type";
        `)
    }
}
