import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateVpnPlanEnglishTitles202606140001 implements MigrationInterface {
    name = 'UpdateVpnPlanEnglishTitles202606140001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "plans"
            SET
                "name" = data.name,
                "title" = data.title,
                "updated_at" = now()
            FROM (VALUES
                ('vpn_1', 'Light', 'Light'),
                ('vpn_2', 'Comfort', 'Comfort'),
                ('vpn_3', 'Premium', 'Premium')
            ) AS data(code, name, title)
            WHERE "plans"."code" = data.code;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "plans"
            SET
                "name" = data.name,
                "title" = data.title,
                "updated_at" = now()
            FROM (VALUES
                ('vpn_1', 'Лайт', 'Лайт'),
                ('vpn_2', 'Комфорт', 'Комфорт'),
                ('vpn_3', 'Премиум', 'Премиум')
            ) AS data(code, name, title)
            WHERE "plans"."code" = data.code;
        `)
    }
}
