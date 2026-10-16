import { MigrationInterface, QueryRunner } from 'typeorm'

export class MigrateLegacySubscriptionsToMatrix202606240001 implements MigrationInterface {
    name = 'MigrateLegacySubscriptionsToMatrix202606240001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "subscriptions" AS subscription
            SET
                "plan_id" = target_plan.id,
                "updated_at" = now()
            FROM "plans" AS legacy_plan
            INNER JOIN "plans" AS target_plan
                ON target_plan.code = CONCAT('vpn_30_', RIGHT(legacy_plan.code, 1))
            WHERE subscription.plan_id = legacy_plan.id
              AND legacy_plan.code IN ('vpn_1', 'vpn_2', 'vpn_3');
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "subscriptions" AS subscription
            SET
                "plan_id" = legacy_plan.id,
                "updated_at" = now()
            FROM "plans" AS matrix_plan
            INNER JOIN "plans" AS legacy_plan
                ON legacy_plan.code = CONCAT('vpn_', RIGHT(matrix_plan.code, 1))
            WHERE subscription.plan_id = matrix_plan.id
              AND matrix_plan.code IN ('vpn_30_1', 'vpn_30_2', 'vpn_30_3');
        `)
    }
}
