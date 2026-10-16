import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { CreatePromoCodeDto } from '../dto/create-promo-code.dto'
import { UpdatePromoCodeDto } from '../dto/update-promo-code.dto'
import { PromoCode } from '../entity/promo-code.entity'
import { PromoUsage, PromoUsageStatusEnum } from '../entity/promo-usage.entity'
import { PromoStatusEnum, PromoTypeEnum } from '../entity/promo.enum'
import { PromoValidationError } from '../errors/promo-validation.error'

@Injectable()
export class PromoService {
    private readonly reservationTtlMinutes = 30

    constructor(
        @InjectRepository(PromoCode) private readonly promoCodeRepository: Repository<PromoCode>,
        @InjectRepository(PromoUsage) private readonly promoUsageRepository: Repository<PromoUsage>,
    ) {}

    async listPromoCodes(page = 1, pageSize = 25) {
        const safePage = Math.max(1, Number(page) || 1)
        const safePageSize = Math.min(100, Math.max(10, Number(pageSize) || 25))
        const [promoCodes, total] = await this.promoCodeRepository.findAndCount({
            order: { createdAt: 'DESC' },
            skip: (safePage - 1) * safePageSize,
            take: safePageSize,
        })
        const response = {
            items: [],
            total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.max(1, Math.ceil(total / safePageSize)),
        }
        if (!promoCodes.length) return response

        const promoCodeIds = promoCodes.map((promo) => promo.id)
        const [usedCounts, reservedCounts] = await Promise.all(
            [
                this.aggregateUsageCounts(promoCodeIds, PromoUsageStatusEnum.APPLIED),
                this.aggregateUsageCounts(promoCodeIds, PromoUsageStatusEnum.RESERVED, this.reservationCutoff()),
            ],
        )

        response.items = promoCodes.map((promo) => ({
            ...promo,
            usedCount: usedCounts.get(promo.id) || 0,
            reservedCount: reservedCounts.get(promo.id) || 0,
            isAvailable: this.isPromoAvailableByDates(promo),
        }))

        return response
    }

    async createPromoCode(dto: CreatePromoCodeDto) {
        this.assertPromoInput(dto)
        const code = this.normalizeCode(dto.code)
        const existing = await this.promoCodeRepository.findOne({ where: { code } })
        if (existing) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Promo code already exists')
        }

        return this.promoCodeRepository.save({
            code,
            name: String(dto.name || code).trim(),
            type: dto.type || PromoTypeEnum.FIRST_PAYMENT_PERCENT,
            valuePercent: dto.valuePercent,
            status: dto.status || PromoStatusEnum.ACTIVE,
            maxUses: dto.maxUses || null,
            durationDays: dto.durationDays,
            devicesLimit: dto.devicesLimit,
            startsAt: dto.startsAt || null,
            expiresAt: dto.expiresAt || this.defaultExpiresAt(),
        } as Partial<PromoCode>)
    }

    async updatePromoCode(id: string, dto: UpdatePromoCodeDto) {
        this.assertPromoInput(dto, true)
        const promo = await this.promoCodeRepository.findOne({ where: { id } })
        if (!promo) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Promo code not found')
        }

        if (dto.code !== undefined) {
            const code = this.normalizeCode(dto.code)
            const existing = await this.promoCodeRepository.findOne({ where: { code } })
            if (existing && existing.id !== promo.id) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Promo code already exists')
            }
            promo.code = code
        }

        if (dto.name !== undefined) promo.name = String(dto.name || promo.code).trim()
        if (dto.type !== undefined) promo.type = dto.type
        if (dto.valuePercent !== undefined) promo.valuePercent = dto.valuePercent
        if (dto.status !== undefined) promo.status = dto.status
        if (dto.maxUses !== undefined) promo.maxUses = dto.maxUses || null
        if (dto.durationDays !== undefined) promo.durationDays = dto.durationDays
        if (dto.devicesLimit !== undefined) promo.devicesLimit = dto.devicesLimit
        if (dto.startsAt !== undefined) promo.startsAt = dto.startsAt || null
        if (dto.expiresAt !== undefined) promo.expiresAt = dto.expiresAt

        return this.promoCodeRepository.save(promo)
    }

    async deactivatePromoCode(id: string) {
        const promo = await this.promoCodeRepository.findOne({ where: { id } })
        if (!promo) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Promo code not found')
        }
        promo.status = PromoStatusEnum.INACTIVE
        return this.promoCodeRepository.save(promo)
    }

    async deletePromoCode(id: string) {
        const promo = await this.promoCodeRepository.findOne({ where: { id } })
        if (!promo) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Promo code not found')
        }

        await this.promoUsageRepository.delete({ promoCodeId: id })
        await this.promoCodeRepository.delete(id)
        return { ok: true, id }
    }

    async validatePromo(code: string) {
        const promo = await this.findPromoByCode(code)
        this.assertPromoAvailable(promo)

        await this.assertUsageLimitAvailable(promo)
        return promo
    }

    async getPromoForActivation(code: string, userId: string) {
        const promo = await this.findPromoByCode(code)
        this.assertPromoAvailable(promo)

        const existing = await this.promoUsageRepository.findOne({ where: { promoCodeId: promo.id, userId } })
        if (existing?.status === PromoUsageStatusEnum.RESERVED && this.isReservationFresh(existing)) {
            return promo
        }
        if (existing?.status === PromoUsageStatusEnum.RESERVED) {
            existing.status = PromoUsageStatusEnum.CANCELED
            await this.promoUsageRepository.save(existing)
        }
        if (existing?.status === PromoUsageStatusEnum.APPLIED) {
            return promo
        }

        await this.assertUsageLimitAvailable(promo)
        return promo
    }

    async validatePromoForUser(code: string, userId: string, baseAmount?: number) {
        const promo = await this.findPromoByCode(code)
        this.assertPromoAvailable(promo)
        await this.assertUserCanUsePromo(promo.id, userId)
        await this.assertUsageLimitAvailable(promo)
        const appliedCount = await this.countAppliedUsages(promo.id)
        const reservedCount = await this.countActiveReservations(promo.id)

        return {
            ...promo,
            usedCount: appliedCount,
            reservedCount,
            discountAmount: this.calculateDiscountAmount(baseAmount || 0, promo.valuePercent),
            finalAmount: this.calculateFinalAmount(baseAmount || 0, promo.valuePercent),
        }
    }

    async reserveUsage(promoCodeId: string, userId: string) {
        const promo = await this.promoCodeRepository.findOne({ where: { id: promoCodeId } })
        if (!promo) {
            throw new PromoValidationError('PROMO_NOT_FOUND')
        }
        this.assertPromoAvailable(promo)

        const existing = await this.promoUsageRepository.findOne({ where: { promoCodeId, userId } })
        if (existing?.status === PromoUsageStatusEnum.RESERVED && this.isReservationFresh(existing)) {
            return existing
        }
        if (existing?.status === PromoUsageStatusEnum.RESERVED) {
            existing.status = PromoUsageStatusEnum.CANCELED
            await this.promoUsageRepository.save(existing)
        }
        if (existing && existing.status !== PromoUsageStatusEnum.CANCELED) {
            throw new PromoValidationError('PROMO_ALREADY_USED')
        }

        if (existing?.status === PromoUsageStatusEnum.CANCELED) {
            await this.assertUsageLimitAvailable(promo)
            existing.status = PromoUsageStatusEnum.RESERVED
            existing.appliedAt = null
            return this.promoUsageRepository.save(existing)
        }

        await this.assertUsageLimitAvailable(promo)
        return this.promoUsageRepository.save({ promoCodeId, userId, status: PromoUsageStatusEnum.RESERVED })
    }

    async applyUsage(promoCodeId: string, userId: string) {
        const usage = await this.promoUsageRepository.findOne({ where: { promoCodeId, userId } })
        if (!usage) {
            throw new PromoValidationError('PROMO_RESERVATION_CONFLICT')
        }
        if (usage.status === PromoUsageStatusEnum.CANCELED) {
            throw new PromoValidationError('PROMO_RESERVATION_CONFLICT')
        }
        if (usage.status === PromoUsageStatusEnum.APPLIED) {
            return usage
        }

        usage.status = PromoUsageStatusEnum.APPLIED
        usage.appliedAt = new Date()
        return this.promoUsageRepository.save(usage)
    }

    async cancelUsage(promoCodeId: string, userId: string) {
        const usage = await this.promoUsageRepository.findOne({ where: { promoCodeId, userId } })
        if (!usage) {
            return null
        }
        if (usage.status === PromoUsageStatusEnum.APPLIED || usage.status === PromoUsageStatusEnum.CANCELED) {
            return usage
        }

        usage.status = PromoUsageStatusEnum.CANCELED
        return this.promoUsageRepository.save(usage)
    }

    calculateDiscountAmount(amount: number, valuePercent: number) {
        const safeAmount = Math.max(0, Number(amount) || 0)
        const safePercent = Math.min(100, Math.max(0, Number(valuePercent) || 0))
        return Math.floor((safeAmount * safePercent) / 100)
    }

    calculateFinalAmount(amount: number, valuePercent: number) {
        return Math.max(0, Math.max(0, Number(amount) || 0) - this.calculateDiscountAmount(amount, valuePercent))
    }

    private async assertUserCanUsePromo(promoCodeId: string, userId: string) {
        const existing = await this.promoUsageRepository.findOne({ where: { promoCodeId, userId } })
        if (existing?.status === PromoUsageStatusEnum.RESERVED && !this.isReservationFresh(existing)) {
            existing.status = PromoUsageStatusEnum.CANCELED
            await this.promoUsageRepository.save(existing)
            return
        }
        if (existing?.status === PromoUsageStatusEnum.RESERVED) {
            throw new PromoValidationError('PROMO_RESERVATION_CONFLICT')
        }
        if (existing?.status === PromoUsageStatusEnum.APPLIED) {
            throw new PromoValidationError('PROMO_ALREADY_USED')
        }
    }

    private async assertUsageLimitAvailable(promo: PromoCode) {
        if (!promo.maxUses || promo.maxUses <= 0) {
            return
        }

        const capacityCount = await this.countCapacityUsages(promo.id)
        if (capacityCount >= promo.maxUses) {
            throw new PromoValidationError('PROMO_LIMIT_REACHED')
        }
    }

    countAppliedUsages(promoCodeId: string) {
        return this.promoUsageRepository.count({
            where: { promoCodeId, status: PromoUsageStatusEnum.APPLIED },
        })
    }

    countActiveReservations(promoCodeId: string) {
        return this.promoUsageRepository.count({
            where: {
                promoCodeId,
                status: PromoUsageStatusEnum.RESERVED,
                updatedAt: MoreThan(this.reservationCutoff()),
            },
        })
    }

    countCapacityUsages(promoCodeId: string) {
        return this.promoUsageRepository.count({
            where: [
                { promoCodeId, status: PromoUsageStatusEnum.APPLIED },
                { promoCodeId, status: PromoUsageStatusEnum.RESERVED, updatedAt: MoreThan(this.reservationCutoff()) },
            ],
        })
    }

    private async aggregateUsageCounts(promoCodeIds: string[], status: PromoUsageStatusEnum, cutoff?: Date) {
        const query = this.promoUsageRepository
            .createQueryBuilder('usage')
            .select('usage.promoCodeId', 'promoCodeId')
            .addSelect('COUNT(*)', 'count')
            .where('usage.promoCodeId IN (:...promoCodeIds)', { promoCodeIds })
            .andWhere('usage.status = :status', { status })
        if (cutoff) query.andWhere('usage.updatedAt > :cutoff', { cutoff })

        const rows = await query.groupBy('usage.promoCodeId').getRawMany()
        return new Map(rows.map((row) => [String(row.promoCodeId), this.normalizeAggregateCount(row.count)]))
    }

    private normalizeAggregateCount(value: unknown) {
        const count = Number(value)
        return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
    }

    private isReservationFresh(usage: PromoUsage) {
        return usage.updatedAt && usage.updatedAt > this.reservationCutoff()
    }

    private reservationCutoff() {
        const cutoff = new Date()
        cutoff.setMinutes(cutoff.getMinutes() - this.reservationTtlMinutes)
        return cutoff
    }

    private isPromoAvailableByDates(promo: PromoCode) {
        const now = new Date()
        if (promo.status !== PromoStatusEnum.ACTIVE) {
            return false
        }
        if (promo.startsAt && promo.startsAt > now) {
            return false
        }
        return !promo.expiresAt || promo.expiresAt > now
    }

    private async findPromoByCode(code: string) {
        const promo = await this.promoCodeRepository.findOne({ where: { code: this.normalizeCode(code) } })
        if (!promo) {
            throw new PromoValidationError('PROMO_NOT_FOUND')
        }
        return promo
    }

    private assertPromoAvailable(promo: PromoCode) {
        const now = new Date()
        if (promo.status !== PromoStatusEnum.ACTIVE) {
            throw new PromoValidationError('PROMO_INACTIVE')
        }
        if (promo.startsAt && promo.startsAt > now) {
            throw new PromoValidationError('PROMO_NOT_STARTED')
        }
        if (promo.expiresAt && promo.expiresAt <= now) {
            throw new PromoValidationError('PROMO_EXPIRED')
        }
    }

    private assertPromoInput(dto: Partial<CreatePromoCodeDto>, partial = false) {
        if (!partial || dto.valuePercent !== undefined) {
            if (dto.valuePercent === undefined || dto.valuePercent < 0 || dto.valuePercent > 100) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Discount percent must be between 0 and 100')
            }
        }
        if (!partial || dto.durationDays !== undefined) {
            if (dto.durationDays === undefined || dto.durationDays < 0) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Duration days must be 0 or greater')
            }
        }
        if (!partial || dto.devicesLimit !== undefined) {
            if (dto.devicesLimit === undefined || dto.devicesLimit < 0) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Devices limit must be 0 or greater')
            }
        }
        if (dto.maxUses !== undefined && dto.maxUses !== null && dto.maxUses < 1) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Max uses must be greater than 0')
        }
    }

    private normalizeCode(code: string) {
        const normalized = String(code || '')
            .trim()
            .toUpperCase()
        if (!normalized) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Promo code is required')
        }
        return normalized
    }

    private defaultExpiresAt() {
        const expiresAt = new Date()
        expiresAt.setFullYear(expiresAt.getFullYear() + 10)
        return expiresAt
    }
}
