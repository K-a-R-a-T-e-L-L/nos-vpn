export enum YooKassaSchemaMode {
    SYNCHRONIZE = 'SYNCHRONIZE',
    MIGRATIONS = 'MIGRATIONS',
}

export function resolveYooKassaSchemaMode(
    dbSynchronize: string | boolean | undefined,
): YooKassaSchemaMode {
    return dbSynchronize === true ||
        (typeof dbSynchronize === 'string' &&
            dbSynchronize.trim().toLowerCase() === 'true')
        ? YooKassaSchemaMode.SYNCHRONIZE
        : YooKassaSchemaMode.MIGRATIONS
}

export function assertYooKassaMigrationRunnerAllowed(
    dbSynchronize: string | boolean | undefined,
): void {
    if (resolveYooKassaSchemaMode(dbSynchronize) === YooKassaSchemaMode.SYNCHRONIZE) {
        throw new Error(
            'YK_MIGRATION_RUNNER_DISABLED_WHILE_DB_SYNCHRONIZE_TRUE',
        )
    }
}
