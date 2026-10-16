import { MigrationInterface, QueryRunner } from 'typeorm'

export class SubscriptionReminderState202606210001 implements MigrationInterface {
    name = 'SubscriptionReminderState202606210001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "subscriptions"
            ADD COLUMN IF NOT EXISTS "reminder_state" jsonb NOT NULL DEFAULT '{}'::jsonb
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "subscriptions"
            DROP COLUMN IF EXISTS "reminder_state"
        `)
    }
}
