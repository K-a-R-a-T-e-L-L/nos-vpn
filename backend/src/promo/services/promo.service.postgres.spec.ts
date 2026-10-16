import { DataSource, EntitySchema } from 'typeorm'

import { PromoService } from './promo.service'
import { startDisposablePostgres } from '../../analytics/testing/disposable-postgres.helper'
import { PromoUsageStatusEnum } from '../entity/promo-usage.entity'
import { PromoStatusEnum, PromoTypeEnum } from '../entity/promo.enum'

jest.setTimeout(60_000)

const PromoCodeListEntity = new EntitySchema({
    name: 'PromoCodeListEntity',
    tableName: 'promo_code',
    columns: {
        id: { type: 'uuid', primary: true },
        code: { type: String },
        name: { type: String },
        type: { type: String },
        valuePercent: { name: 'value_percent', type: Number },
        status: { type: String },
        maxUses: { name: 'max_uses', type: Number, nullable: true },
        durationDays: { name: 'duration_days', type: Number },
        devicesLimit: { name: 'devices_limit', type: Number },
        startsAt: { name: 'starts_at', type: 'timestamptz', nullable: true },
        expiresAt: { name: 'expires_at', type: 'timestamptz', nullable: true },
        createdAt: { name: 'created_at', type: 'timestamptz' },
        updatedAt: { name: 'updated_at', type: 'timestamptz' },
        deletedAt: { name: 'deleted_at', type: 'timestamptz', nullable: true, deleteDate: true },
    },
})

const PromoUsageListEntity = new EntitySchema({
    name: 'PromoUsageListEntity',
    tableName: 'promo_usage',
    columns: {
        id: { type: 'uuid', primary: true },
        promoCodeId: { name: 'promo_code_id', type: 'uuid' },
        userId: { name: 'user_id', type: 'uuid' },
        status: { type: String },
        appliedAt: { name: 'applied_at', type: 'timestamptz', nullable: true },
        createdAt: { name: 'created_at', type: 'timestamptz' },
        updatedAt: { name: 'updated_at', type: 'timestamptz' },
        deletedAt: { name: 'deleted_at', type: 'timestamptz', nullable: true, deleteDate: true },
    },
})

function createDataSource(cluster: { host: string; port: number; user: string; database: string }) {
    return new DataSource({
        type: 'postgres',
        host: cluster.host,
        port: cluster.port,
        username: cluster.user,
        database: cluster.database,
        entities: [PromoCodeListEntity, PromoUsageListEntity],
        synchronize: true,
        migrationsRun: false,
    })
}

function uuid(index: number) {
    return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

describe('PromoService PostgreSQL list aggregates', () => {
    it('preserves page counts and order with two grouped usage queries and skips aggregates for an empty page', async () => {
        const cluster = await startDisposablePostgres('nosvpn-promo-list-pg-')
        let dataSource: DataSource | undefined
        let stopError: unknown
        try {
            console.info(`[promo-list-postgres] pid=${cluster.pid} port=${cluster.port}`)
            dataSource = createDataSource(cluster)
            await dataSource.initialize()

            const promos = dataSource.getRepository(PromoCodeListEntity)
            const usages = dataSource.getRepository(PromoUsageListEntity)
            const now = new Date()
            const createdAt = new Date('2026-09-01T00:00:00.000Z')
            const expiresAt = new Date('2099-01-01T00:00:00.000Z')
            await promos.save(
                Array.from({ length: 11 }, (_, offset) => ({
                    id: uuid(offset + 1),
                    code: `PROMO-${offset + 1}`,
                    name: `Promo ${offset + 1}`,
                    type: PromoTypeEnum.FIRST_PAYMENT_PERCENT,
                    valuePercent: 10,
                    status: PromoStatusEnum.ACTIVE,
                    maxUses: null,
                    durationDays: 30,
                    devicesLimit: 1,
                    startsAt: null,
                    expiresAt,
                    createdAt: new Date(createdAt.getTime() + (11 - offset) * 1000),
                    updatedAt: now,
                    ...(offset === 10 ? { deletedAt: now } : {}),
                })),
            )
            const fresh = new Date(now.getTime() - 5 * 60 * 1000)
            const stale = new Date(now.getTime() - 31 * 60 * 1000)
            await usages.save([
                { id: uuid(101), promoCodeId: uuid(2), userId: uuid(201), status: PromoUsageStatusEnum.APPLIED, appliedAt: now, createdAt: now, updatedAt: now },
                { id: uuid(102), promoCodeId: uuid(2), userId: uuid(202), status: PromoUsageStatusEnum.APPLIED, appliedAt: now, createdAt: now, updatedAt: now },
                { id: uuid(103), promoCodeId: uuid(3), userId: uuid(203), status: PromoUsageStatusEnum.RESERVED, appliedAt: null, createdAt: fresh, updatedAt: fresh },
                { id: uuid(104), promoCodeId: uuid(3), userId: uuid(204), status: PromoUsageStatusEnum.RESERVED, appliedAt: null, createdAt: fresh, updatedAt: fresh },
                { id: uuid(105), promoCodeId: uuid(4), userId: uuid(205), status: PromoUsageStatusEnum.RESERVED, appliedAt: null, createdAt: stale, updatedAt: stale },
                { id: uuid(106), promoCodeId: uuid(5), userId: uuid(206), status: PromoUsageStatusEnum.APPLIED, appliedAt: now, createdAt: now, updatedAt: now },
                { id: uuid(107), promoCodeId: uuid(5), userId: uuid(207), status: PromoUsageStatusEnum.RESERVED, appliedAt: null, createdAt: fresh, updatedAt: fresh },
                { id: uuid(108), promoCodeId: uuid(6), userId: uuid(208), status: PromoUsageStatusEnum.APPLIED, appliedAt: now, createdAt: now, updatedAt: now, deletedAt: now },
                { id: uuid(109), promoCodeId: uuid(7), userId: uuid(209), status: PromoUsageStatusEnum.CANCELED, appliedAt: null, createdAt: now, updatedAt: now },
            ])

            const service = new PromoService(promos as any, usages as any)
            const aggregateBuilderSpy = jest.spyOn(usages, 'createQueryBuilder')
            const countSpy = jest.spyOn(usages, 'count')
            const firstPage = await service.listPromoCodes(1, 10)

            expect(firstPage).toMatchObject({ total: 10, page: 1, pageSize: 10, totalPages: 1 })
            expect(firstPage.items.map((item) => item.id)).toEqual(Array.from({ length: 10 }, (_, offset) => uuid(offset + 1)))
            expect(firstPage.items.map((item) => [item.id, item.usedCount, item.reservedCount])).toEqual([
                [uuid(1), 0, 0],
                [uuid(2), 2, 0],
                [uuid(3), 0, 2],
                [uuid(4), 0, 0],
                [uuid(5), 1, 1],
                [uuid(6), 0, 0],
                [uuid(7), 0, 0],
                [uuid(8), 0, 0],
                [uuid(9), 0, 0],
                [uuid(10), 0, 0],
            ])
            expect(aggregateBuilderSpy).toHaveBeenCalledTimes(2)
            expect(countSpy).not.toHaveBeenCalled()

            aggregateBuilderSpy.mockClear()
            countSpy.mockClear()
            await expect(service.listPromoCodes(2, 10)).resolves.toEqual({
                items: [],
                total: 10,
                page: 2,
                pageSize: 10,
                totalPages: 1,
            })
            expect(aggregateBuilderSpy).not.toHaveBeenCalled()
            expect(countSpy).not.toHaveBeenCalled()
        } finally {
            if (dataSource?.isInitialized) await dataSource.destroy().catch(() => undefined)
            try { cluster.stop() } catch (error) { stopError = error }
            if (stopError) throw stopError
        }
    })
})
