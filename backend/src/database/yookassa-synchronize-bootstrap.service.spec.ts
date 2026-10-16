import { Logger } from '@nestjs/common'

import { YooKassaSynchronizeBootstrapService } from './yookassa-synchronize-bootstrap.service'

describe('YooKassaSynchronizeBootstrapService', () => {
    const makeHarness = (synchronize: string | boolean | undefined) => {
        const queryRunner = {
            connect: jest.fn().mockResolvedValue(undefined),
            query: jest.fn(),
            release: jest.fn().mockResolvedValue(undefined),
        }
        const dataSource = {
            createQueryRunner: jest.fn(() => queryRunner),
        }
        const config = {
            get: jest.fn(() => synchronize),
        }
        const service = new YooKassaSynchronizeBootstrapService(
            dataSource as never,
            config as never,
        )
        return { service, queryRunner, dataSource }
    }

    it('does nothing when synchronize mode is disabled', async () => {
        const { service, dataSource } = makeHarness('false')
        await service.onApplicationBootstrap()
        expect(dataSource.createQueryRunner).not.toHaveBeenCalled()
    })

    it('locks, validates, runs exactly five idempotent updates and unlocks', async () => {
        const { service, queryRunner } = makeHarness('true')
        queryRunner.query
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce({ affected: 1 })
            .mockResolvedValueOnce({ affected: 2 })
            .mockResolvedValueOnce({ affected: 3 })
            .mockResolvedValueOnce({ affected: 4 })
            .mockResolvedValueOnce({ affected: 5 })
            .mockResolvedValueOnce([])

        await service.onApplicationBootstrap()

        const sql = queryRunner.query.mock.calls.map(([statement]) => String(statement))
        expect(queryRunner.connect).toHaveBeenCalledTimes(1)
        expect(sql[0]).toContain("pg_advisory_lock")
        expect(sql[0]).toContain('nosvpn:yookassa:synchronize-bootstrap')
        expect(sql[1]).toContain('to_regclass')
        expect(sql[1]).toContain('information_schema.columns')
        expect(sql[1]).toContain('pg_indexes')
        expect(sql[1]).toContain('pg_constraint')
        const updates = sql.filter((statement) => /^\s*UPDATE payments/m.test(statement))
        expect(updates).toHaveLength(5)
        expect(updates.join('\n')).toContain(`SET kind = 'BONUS_BALANCE'`)
        expect(updates.join('\n')).toContain(`SET kind = 'PROMO_DISCOUNT'`)
        expect(updates.join('\n')).toContain(`SET kind = 'EXTERNAL'`)
        expect(updates.join('\n')).toContain(`SET merchant = 'SITE'`)
        expect(updates.join('\n')).toContain(`SET merchant = 'BOT'`)
        expect(sql.at(-1)).toContain('pg_advisory_unlock')
        expect(sql.join('\n')).not.toMatch(/\b(CREATE|ALTER|DROP)\b/i)
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('throws before backfill when the schema contract is incomplete', async () => {
        const { service, queryRunner } = makeHarness(true)
        queryRunner.query
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { missing_object: 'index:IDX_payments_activation_retry' },
            ])
            .mockResolvedValueOnce([])

        await expect(service.onApplicationBootstrap()).rejects.toThrow(
            'YK_SYNCHRONIZE_SCHEMA_CONTRACT_INCOMPLETE:index:IDX_payments_activation_retry',
        )
        expect(
            queryRunner.query.mock.calls.filter(([sql]) =>
                /^\s*UPDATE payments/m.test(String(sql)),
            ),
        ).toHaveLength(0)
        expect(
            queryRunner.query.mock.calls.some(([sql]) =>
                String(sql).includes('pg_advisory_unlock'),
            ),
        ).toBe(true)
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('unlocks and releases when a backfill statement fails', async () => {
        const { service, queryRunner } = makeHarness(true)
        queryRunner.query
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('write failed'))
            .mockResolvedValueOnce([])

        await expect(service.onApplicationBootstrap()).rejects.toThrow('write failed')
        expect(
            queryRunner.query.mock.calls.some(([sql]) =>
                String(sql).includes('pg_advisory_unlock'),
            ),
        ).toBe(true)
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('logs only aggregate affected row counts and is safe to repeat', async () => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation()
        const run = async () => {
            const { service, queryRunner } = makeHarness(true)
            queryRunner.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce({ affected: 0 })
                .mockResolvedValueOnce({ affected: 0 })
                .mockResolvedValueOnce({ affected: 0 })
                .mockResolvedValueOnce({ affected: 0 })
                .mockResolvedValueOnce({ affected: 0 })
                .mockResolvedValueOnce([])
            await service.onApplicationBootstrap()
        }

        await run()
        await run()

        const output = JSON.stringify(log.mock.calls)
        expect(output).toContain('affected')
        expect(output).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)
        expect(output).not.toContain('metadata_snapshot')
        expect(output).not.toContain('provider payload')
        log.mockRestore()
    })
})
