import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateVpnPlanPricesAndDescriptions202606130002 implements MigrationInterface {
    name = 'UpdateVpnPlanPricesAndDescriptions202606130002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "plans"
            ADD COLUMN IF NOT EXISTS "description" character varying;
        `)

        await queryRunner.query(`
            UPDATE "plans"
            SET
                "name" = data.name,
                "title" = data.title,
                "description" = data.description,
                "amount" = data.amount,
                "updated_at" = now()
            FROM (VALUES
                ('vpn_1', 'Light', 'Light', '1 устройство', 199),
                ('vpn_2', 'Comfort', 'Comfort', '2 устройства', 249),
                ('vpn_3', 'Premium', 'Premium', '3 устройства', 299)
            ) AS data(code, name, title, description, amount)
            WHERE "plans"."code" = data.code;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "plans"
            SET
                "name" = data.name,
                "title" = data.title,
                "description" = NULL,
                "amount" = data.amount,
                "updated_at" = now()
            FROM (VALUES
                ('vpn_1', '1 устройство', '1 устройство', 99),
                ('vpn_2', '2 устройства', '2 устройства', 149),
                ('vpn_3', '3 устройства', '3 устройства', 199)
            ) AS data(code, name, title, amount)
            WHERE "plans"."code" = data.code;
        `)
    }
}
