import { MigrationInterface, QueryRunner } from 'typeorm'

export class FoundationVpnLayer202605240001 implements MigrationInterface {
    name = 'FoundationVpnLayer202605240001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscriptions_status_enum') THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                        WHERE t.typname = 'subscriptions_status_enum' AND e.enumlabel = 'GRACE'
                    ) THEN
                        ALTER TYPE "subscriptions_status_enum" ADD VALUE 'GRACE';
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                        WHERE t.typname = 'subscriptions_status_enum' AND e.enumlabel = 'EXPIRED'
                    ) THEN
                        ALTER TYPE "subscriptions_status_enum" ADD VALUE 'EXPIRED';
                    END IF;
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "referral_code" character varying,
            ADD COLUMN IF NOT EXISTS "referred_by_user_id" uuid,
            ADD COLUMN IF NOT EXISTS "first_paid_at" TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS "has_used_trial" boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "trial_used_at" TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS "total_referral_bonus_days" integer NOT NULL DEFAULT 0
        `)

        await queryRunner.query(`
            UPDATE "users"
            SET "referral_code" = CONCAT('ref_', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
            WHERE "referral_code" IS NULL
        `)

        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_referral_code" ON "users" ("referral_code")`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_referred_by_user_id" ON "users" ("referred_by_user_id")`)

        await queryRunner.query(`
            ALTER TABLE "plans"
            ADD COLUMN IF NOT EXISTS "code" character varying,
            ADD COLUMN IF NOT EXISTS "title" character varying,
            ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
        `)
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_plans_code" ON "plans" ("code")`)

        await queryRunner.query(`
            ALTER TABLE "subscriptions"
            ADD COLUMN IF NOT EXISTS "ends_at" timestamp,
            ADD COLUMN IF NOT EXISTS "grace_ends_at" timestamp,
            ADD COLUMN IF NOT EXISTS "is_trial" boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp,
            ADD COLUMN IF NOT EXISTS "source_promo_code_id" uuid,
            ADD COLUMN IF NOT EXISTS "last_provisioned_at" timestamp,
            ADD COLUMN IF NOT EXISTS "access_disabled_at" timestamp
        `)

        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD COLUMN IF NOT EXISTS "external_event_id" character varying,
            ADD COLUMN IF NOT EXISTS "external_status" character varying,
            ADD COLUMN IF NOT EXISTS "metadata_snapshot" jsonb
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'server_node_provider_type_enum') THEN
                    CREATE TYPE "server_node_provider_type_enum" AS ENUM('XUI');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "server_node" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ,
                "code" character varying NOT NULL,
                "name" character varying NOT NULL,
                "region" character varying NOT NULL,
                "provider_type" "server_node_provider_type_enum" NOT NULL,
                "base_url" character varying NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "priority" integer NOT NULL DEFAULT 100,
                "meta" jsonb,
                CONSTRAINT "PK_server_node_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_server_node_code" UNIQUE ("code")
            )
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vpn_access_provider_type_enum') THEN
                    CREATE TYPE "vpn_access_provider_type_enum" AS ENUM('XUI');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vpn_access_status_enum') THEN
                    CREATE TYPE "vpn_access_status_enum" AS ENUM('PENDING', 'ACTIVE', 'GRACE', 'DISABLED', 'ERROR', 'ARCHIVED');
                END IF;
            END
            $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "vpn_access" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ,
                "subscription_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "provider_type" "vpn_access_provider_type_enum" NOT NULL,
                "server_node_id" uuid NOT NULL,
                "inbound_key" character varying NOT NULL,
                "status" "vpn_access_status_enum" NOT NULL DEFAULT 'PENDING',
                "provider_external_id" character varying,
                "provider_client_key" character varying,
                "subscription_url" text,
                "qr_payload" text,
                "config_payload" jsonb,
                "access_starts_at" TIMESTAMPTZ NOT NULL,
                "access_ends_at" TIMESTAMPTZ NOT NULL,
                "disabled_at" TIMESTAMPTZ,
                "last_synced_at" TIMESTAMPTZ,
                "last_sync_status" character varying,
                "last_sync_error" text,
                "version" integer NOT NULL DEFAULT 1,
                "idempotency_key_last" character varying,
                CONSTRAINT "PK_vpn_access_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_vpn_access_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_vpn_access_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_vpn_access_server_node" FOREIGN KEY ("server_node_id") REFERENCES "server_node"("id") ON DELETE NO ACTION
            )
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_vpn_access_subscription_status"
            ON "vpn_access" ("subscription_id", "status")
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_vpn_access_user_status"
            ON "vpn_access" ("user_id", "status")
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_vpn_access_active_scope"
            ON "vpn_access" ("subscription_id", "provider_type", "server_node_id", "inbound_key")
            WHERE "status" IN ('PENDING', 'ACTIVE', 'GRACE')
        `)

        await queryRunner.query(`
            INSERT INTO "server_node" ("id", "code", "name", "region", "provider_type", "base_url", "is_active", "priority", "meta")
            VALUES (gen_random_uuid(), 'nl-xui-1', 'NL XUI #1', 'NL', 'XUI', 'https://replace-me.local:2053', true, 100, '{"defaultInboundKey":"1"}')
            ON CONFLICT ("code") DO NOTHING
        `)

        await queryRunner.query(`
            INSERT INTO "meter" ("id", "code", "name", "unit", "is_active", "description", "created_at", "updated_at")
            VALUES (gen_random_uuid(), 'vpn_device_slots', 'VPN Device Slots', 'slot', true, 'Max number of concurrent device slots for VPN plan', now(), now())
            ON CONFLICT ("code") DO NOTHING
        `)

        await queryRunner.query(`
            INSERT INTO "plans" ("id", "name", "title", "code", "period", "amount", "is_active", "created_at", "updated_at")
            VALUES
                (gen_random_uuid(), 'VPN 1 Device', '1 устройство', 'vpn_1', 30, 99, true, now(), now()),
                (gen_random_uuid(), 'VPN 2 Devices', '2 устройства', 'vpn_2', 30, 149, true, now(), now()),
                (gen_random_uuid(), 'VPN 3 Devices', '3 устройства', 'vpn_3', 30, 199, true, now(), now())
            ON CONFLICT ("code") DO UPDATE SET
                "name" = EXCLUDED."name",
                "title" = EXCLUDED."title",
                "period" = EXCLUDED."period",
                "amount" = EXCLUDED."amount",
                "is_active" = EXCLUDED."is_active",
                "updated_at" = now()
        `)

        await queryRunner.query(`
            INSERT INTO "plan_limit" ("id", "plan_id", "meter_id", "included_units", "overage_allowed", "created_at", "updated_at")
            SELECT gen_random_uuid(), p.id, m.id, v.units, false, now(), now()
            FROM (VALUES ('vpn_1', 1), ('vpn_2', 2), ('vpn_3', 3)) AS v(code, units)
            JOIN "plans" p ON p.code = v.code
            JOIN "meter" m ON m.code = 'vpn_device_slots'
            WHERE NOT EXISTS (
                SELECT 1
                FROM "plan_limit" pl
                WHERE pl.plan_id = p.id AND pl.meter_id = m.id
            )
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_vpn_access_active_scope"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vpn_access_user_status"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vpn_access_subscription_status"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "vpn_access"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "server_node"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "vpn_access_status_enum"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "vpn_access_provider_type_enum"`)
        await queryRunner.query(`DROP TYPE IF EXISTS "server_node_provider_type_enum"`)

        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "metadata_snapshot"`)
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "external_status"`)
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "external_event_id"`)

        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "access_disabled_at"`)
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "last_provisioned_at"`)
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "source_promo_code_id"`)
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "trial_ends_at"`)
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "is_trial"`)
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "grace_ends_at"`)
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "ends_at"`)

        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_plans_code"`)
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN IF EXISTS "is_active"`)
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN IF EXISTS "title"`)
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN IF EXISTS "code"`)

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_referred_by_user_id"`)
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_referral_code"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "total_referral_bonus_days"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "trial_used_at"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "has_used_trial"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "first_paid_at"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "referred_by_user_id"`)
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_code"`)
    }
}
