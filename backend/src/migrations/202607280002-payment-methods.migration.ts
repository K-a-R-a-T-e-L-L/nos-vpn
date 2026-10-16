import { MigrationInterface, QueryRunner } from 'typeorm'

export class PaymentMethods202607280002 implements MigrationInterface {
    name = 'PaymentMethods202607280002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_status_enum') THEN
                    CREATE TYPE payment_method_status_enum AS ENUM ('ACTIVE', 'REVOKED');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "payment_methods" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz,
                "user_id" uuid NOT NULL,
                "provider" payment_provider_enum NOT NULL,
                "merchant" payment_merchant_enum NOT NULL,
                "provider_method_id" character varying NOT NULL,
                "status" payment_method_status_enum NOT NULL DEFAULT 'ACTIVE',
                "revoked_at" timestamptz,
                "last_used_at" timestamptz,
                CONSTRAINT "PK_payment_methods" PRIMARY KEY ("id"),
                CONSTRAINT "FK_payment_methods_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_methods_provider_merchant_method"
            ON "payment_methods" ("provider", "merchant", "provider_method_id");
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_payment_methods_user_status"
            ON "payment_methods" ("user_id", "status");
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const result: Array<{ exists: boolean }> = await queryRunner.query(
            `SELECT EXISTS (SELECT 1 FROM "payment_methods" LIMIT 1) AS "exists";`,
        )
        if (result[0]?.exists) {
            throw new Error('Cannot revert payment_methods while rows exist')
        }

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_methods_user_status";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_payment_methods_provider_merchant_method";`)
        await queryRunner.query(`ALTER TABLE IF EXISTS "payment_methods" DROP CONSTRAINT IF EXISTS "FK_payment_methods_user";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "payment_methods";`)
        await queryRunner.query(`DROP TYPE IF EXISTS payment_method_status_enum;`)
    }
}
