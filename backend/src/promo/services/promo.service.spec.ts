import { PromoService } from './promo.service'
import { PromoUsageStatusEnum } from '../entity/promo-usage.entity'
import { PromoStatusEnum } from '../entity/promo.enum'
import { PromoValidationError } from '../errors/promo-validation.error'

describe('PromoService', () => {
    const promo = {
        id: 'promo-1',
        code: 'FREE100',
        status: PromoStatusEnum.ACTIVE,
        maxUses: 1,
        updatedAt: new Date(),
    } as any

    const createService = () => {
        const promoCodeRepository = {
            findOne: jest.fn(),
            findAndCount: jest.fn(),
        }
        const promoUsageRepository = {
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
        }

        const service = new PromoService(promoCodeRepository as any, promoUsageRepository as any)
        return { service, promoCodeRepository, promoUsageRepository }
    }

    const aggregateQuery = (rows: Array<{ promoCodeId: string; count: string | number }>) => {
        const query = {
            select: jest.fn(),
            addSelect: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            groupBy: jest.fn(),
            getRawMany: jest.fn().mockResolvedValue(rows),
        }
        query.select.mockReturnValue(query)
        query.addSelect.mockReturnValue(query)
        query.where.mockReturnValue(query)
        query.andWhere.mockReturnValue(query)
        query.groupBy.mockReturnValue(query)
        return query
    }

    it('aggregates page usage counts in fixed grouped queries without per-promo counts', async () => {
        const { service, promoCodeRepository, promoUsageRepository } = createService()
        const first = { ...promo, id: 'promo-1', createdAt: new Date('2026-09-02T00:00:00.000Z') }
        const second = { ...promo, id: 'promo-2', createdAt: new Date('2026-09-01T00:00:00.000Z') }
        const applied = aggregateQuery([{ promoCodeId: 'promo-1', count: '2' }])
        const reserved = aggregateQuery([{ promoCodeId: 'promo-2', count: 3 }])
        promoCodeRepository.findAndCount.mockResolvedValue([[first, second], 12])
        promoUsageRepository.createQueryBuilder.mockReturnValueOnce(applied).mockReturnValueOnce(reserved)

        await expect(service.listPromoCodes(2, 10)).resolves.toMatchObject({
            total: 12,
            page: 2,
            pageSize: 10,
            totalPages: 2,
            items: [
                { id: 'promo-1', usedCount: 2, reservedCount: 0 },
                { id: 'promo-2', usedCount: 0, reservedCount: 3 },
            ],
        })

        expect(promoCodeRepository.findAndCount).toHaveBeenCalledWith({
            order: { createdAt: 'DESC' },
            skip: 10,
            take: 10,
        })
        expect(promoUsageRepository.createQueryBuilder).toHaveBeenCalledTimes(2)
        expect(promoUsageRepository.count).not.toHaveBeenCalled()
        expect(applied.where).toHaveBeenCalledWith('usage.promoCodeId IN (:...promoCodeIds)', {
            promoCodeIds: ['promo-1', 'promo-2'],
        })
        expect(applied.andWhere).toHaveBeenCalledWith('usage.status = :status', {
            status: PromoUsageStatusEnum.APPLIED,
        })
        expect(reserved.andWhere).toHaveBeenCalledWith('usage.status = :status', {
            status: PromoUsageStatusEnum.RESERVED,
        })
        expect(reserved.andWhere.mock.calls.some(([condition]: [string]) => condition.includes('usage.updatedAt > :cutoff'))).toBe(true)
    })

    it('skips usage aggregates for an empty promo page while preserving pagination metadata', async () => {
        const { service, promoCodeRepository, promoUsageRepository } = createService()
        promoCodeRepository.findAndCount.mockResolvedValue([[], 12])

        await expect(service.listPromoCodes(3, 10)).resolves.toEqual({
            items: [],
            total: 12,
            page: 3,
            pageSize: 10,
            totalPages: 2,
        })

        expect(promoUsageRepository.createQueryBuilder).not.toHaveBeenCalled()
        expect(promoUsageRepository.count).not.toHaveBeenCalled()
    })

    it('reuses a fresh reserved usage for the same user without consuming maxUses again', async () => {
        const { service, promoCodeRepository, promoUsageRepository } = createService()
        const freshReservation = {
            promoCodeId: promo.id,
            userId: 'user-1',
            status: PromoUsageStatusEnum.RESERVED,
            updatedAt: new Date(),
        }

        promoCodeRepository.findOne.mockResolvedValue(promo)
        promoUsageRepository.findOne.mockResolvedValue(freshReservation)

        const result = await service.reserveUsage(promo.id, 'user-1')

        expect(result).toBe(freshReservation)
        expect(promoUsageRepository.count).not.toHaveBeenCalled()
        expect(promoUsageRepository.save).not.toHaveBeenCalled()
    })

    it('creates a reservation when no usage exists and limit is still available', async () => {
        const { service, promoCodeRepository, promoUsageRepository } = createService()

        promoCodeRepository.findOne.mockResolvedValue(promo)
        promoUsageRepository.findOne.mockResolvedValue(null)
        promoUsageRepository.count.mockResolvedValue(0)
        promoUsageRepository.save.mockImplementation(async (value: any) => value)

        const result = await service.reserveUsage(promo.id, 'user-2')

        expect(result).toMatchObject({
            promoCodeId: promo.id,
            userId: 'user-2',
            status: PromoUsageStatusEnum.RESERVED,
        })
        expect(promoUsageRepository.count).toHaveBeenCalled()
        expect(promoUsageRepository.save).toHaveBeenCalledWith({
            promoCodeId: promo.id,
            userId: 'user-2',
            status: PromoUsageStatusEnum.RESERVED,
        })
    })

    it('allows activation to reuse an already reserved promo for the same user', async () => {
        const { service, promoCodeRepository, promoUsageRepository } = createService()
        const freshReservation = {
            promoCodeId: promo.id,
            userId: 'user-3',
            status: PromoUsageStatusEnum.RESERVED,
            updatedAt: new Date(),
        }

        promoCodeRepository.findOne.mockResolvedValue(promo)
        promoUsageRepository.findOne.mockResolvedValue(freshReservation)

        const result = await service.getPromoForActivation(promo.code, 'user-3')

        expect(result).toBe(promo)
        expect(promoUsageRepository.count).not.toHaveBeenCalled()
    })

    it.each([
        ['missing', null, 'PROMO_NOT_FOUND'],
        ['inactive', { ...promo, status: PromoStatusEnum.INACTIVE }, 'PROMO_INACTIVE'],
        ['not started', { ...promo, startsAt: new Date(Date.now() + 60_000) }, 'PROMO_NOT_STARTED'],
        ['expired', { ...promo, expiresAt: new Date(Date.now() - 60_000) }, 'PROMO_EXPIRED'],
    ])('throws a typed validation error for %s promo', async (_label, candidate, code) => {
        const { service, promoCodeRepository } = createService()
        promoCodeRepository.findOne.mockResolvedValue(candidate)

        const promise = service.validatePromoForUser('FREE100', 'user-1')
        await expect(promise).rejects.toBeInstanceOf(PromoValidationError)
        await expect(promise).rejects.toMatchObject({ code })
    })

    it('reports applied and active reserved usages separately while capacity combines both', async () => {
        const { service, promoUsageRepository } = createService()
        promoUsageRepository.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(5)

        await expect(service.countAppliedUsages('promo-1')).resolves.toBe(2)
        await expect(service.countActiveReservations('promo-1')).resolves.toBe(3)
        await expect(service.countCapacityUsages('promo-1')).resolves.toBe(5)

        expect(promoUsageRepository.count.mock.calls[0][0].where).toEqual({
            promoCodeId: 'promo-1',
            status: PromoUsageStatusEnum.APPLIED,
        })
        expect(promoUsageRepository.count.mock.calls[1][0].where).toMatchObject({
            promoCodeId: 'promo-1',
            status: PromoUsageStatusEnum.RESERVED,
        })
        expect(promoUsageRepository.count.mock.calls[2][0].where).toHaveLength(2)
    })

    it('uses capacity rather than the active reservation count for the usage limit', async () => {
        const { service, promoCodeRepository, promoUsageRepository } = createService()
        promoCodeRepository.findOne.mockResolvedValue(promo)
        promoUsageRepository.findOne.mockResolvedValue(null)
        promoUsageRepository.count.mockResolvedValue(1)

        await expect(service.validatePromoForUser('FREE100', 'user-4')).rejects.toMatchObject({
            code: 'PROMO_LIMIT_REACHED',
        })
    })

    it.each([
        [PromoUsageStatusEnum.APPLIED, 'PROMO_ALREADY_USED'],
        [PromoUsageStatusEnum.RESERVED, 'PROMO_RESERVATION_CONFLICT'],
    ])('keeps %s promo usage blocked with %s', async (status, code) => {
        const { service, promoCodeRepository, promoUsageRepository } = createService()
        promoCodeRepository.findOne.mockResolvedValue(promo)
        promoUsageRepository.findOne.mockResolvedValue({
            promoCodeId: promo.id,
            userId: 'user-1',
            status,
            updatedAt: new Date(),
        })

        await expect(service.validatePromoForUser(promo.code, 'user-1')).rejects.toMatchObject({ code })
    })
})
