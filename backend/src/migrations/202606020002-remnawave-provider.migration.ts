import { MigrationInterface, QueryRunner } from 'typeorm'

export class RemnawaveProvider202606020002 implements MigrationInterface {
    name = 'RemnawaveProvider202606020002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'server_node_provider_type_enum') THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum e
                        JOIN pg_type t ON e.enumtypid = t.oid
                        WHERE t.typname = 'server_node_provider_type_enum'
                          AND e.enumlabel = 'REMNAWAVE'
                    ) THEN
                        ALTER TYPE "server_node_provider_type_enum" ADD VALUE 'REMNAWAVE';
                    END IF;
                END IF;

                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vpn_access_provider_type_enum') THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum e
                        JOIN pg_type t ON e.enumtypid = t.oid
                        WHERE t.typname = 'vpn_access_provider_type_enum'
                          AND e.enumlabel = 'REMNAWAVE'
                    ) THEN
                        ALTER TYPE "vpn_access_provider_type_enum" ADD VALUE 'REMNAWAVE';
                    END IF;
                END IF;

                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_operation_log_provider_type_enum') THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum e
                        JOIN pg_type t ON e.enumtypid = t.oid
                        WHERE t.typname = 'access_operation_log_provider_type_enum'
                          AND e.enumlabel = 'REMNAWAVE'
                    ) THEN
                        ALTER TYPE "access_operation_log_provider_type_enum" ADD VALUE 'REMNAWAVE';
                    END IF;
                END IF;
            END
            $$;
        `)
    }

    public async down(): Promise<void> {
        // PostgreSQL does not support removing enum values safely without recreating the enum type.
    }
}
