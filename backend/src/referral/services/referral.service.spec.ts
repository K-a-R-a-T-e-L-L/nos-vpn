import { ReferralService } from './referral.service'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { ReferralRewardStatusEnum } from '../entity/referral-bonus-ledger.entity'
import {
    REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION,
    REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION,
} from '../utils/referral-reward-calculator'

function createMemoryRepository<T extends { id?: string }>(initialRows: T[] = []) {
    const rows: T[] = [...initialRows]
    let seq = 1

    return {
        rows,
        async save(entity: T) {
            if (!entity.id) {
                entity.id = `id-${seq++}`
                rows.push(entity)
                return entity
            }

            const index = rows.findIndex((row) => row.id === entity.id)
            if (index >= 0) {
                rows[index] = entity
            } else {
                rows.push(entity)
            }
            return entity
        },
        async findOne(options: any) {
            const where = options?.where
            if (!where) {
                return null
            }

            return rows.find((row: any) => Object.entries(where).every(([key, value]) => row[key] === value)) || null
        },
        async count(options: any) {
            const where = options?.where
            if (!where) {
                return rows.length
            }

            return rows.filter((row: any) => Object.entries(where).every(([key, value]) => row[key] === value)).length
        },
        async find() {
            return rows
        },
        createQueryBuilder(alias?: string) {
            let filtered = [...rows]

            return {
                where(_query: string, params: Record<string, any>) {
                    if (params?.userId) {
                        filtered = filtered.filter((row: any) => row.referredByUserId === params.userId)
                    }
                    return this
                },
                andWhere(query: string, params?: Record<string, any>) {
                    if (query.includes('firstPaidAt IS NOT NULL')) {
                        filtered = filtered.filter((row: any) => Boolean((row as any).firstPaidAt))
                    }
                    if (query.includes('subscription.status IN') && params?.statuses) {
                        filtered = filtered.filter((row: any) =>
                            params.statuses.includes((row as any).subscription?.status),
                        )
                    }
                    return this
                },
                leftJoin() {
                    return this
                },
                async getCount() {
                    return filtered.length
                },
            }
        },
    }
}

function createService(users: any[], referralRows: any[] = []) {
    const userRepository = createMemoryRepository<any>(users)
    const referralBonusRepository = createMemoryRepository<any>(referralRows)
    const configService = {
        get(key: string) {
            if (key === 'TELEGRAM_BOT_USERNAME') {
                return 'your_vpn_bot'
            }
            return null
        },
    }
    const analyticsService = {
        trackReferralAttached: jest.fn(async () => undefined),
        trackReferralFriendPaid: jest.fn(async () => undefined),
    }
    const notificationService = {
        notify: jest.fn(async () => undefined),
    }
    const dataSource = {
        transaction: jest.fn(async (work: (manager: any) => unknown) =>
            work({
                getRepository(entity: any) {
                    if (entity?.name === 'User') return userRepository
                    if (entity?.name === 'ReferralBonusLedger') return referralBonusRepository
                    throw new Error(`Unexpected repository ${entity?.name || entity}`)
                },
            }),
        ),
    }
    const service = new ReferralService(
        configService as any,
        userRepository as any,
        referralBonusRepository as any,
        analyticsService as any,
        notificationService as any,
        dataSource as any,
    )

    return {
        service,
        userRepository,
        referralBonusRepository,
        analyticsService,
        notificationService,
        dataSource,
    }
}

describe('ReferralService', () => {
    const netCalculation = {
        status: 'CALCULATED' as const,
        grossAmountRub: '1000.00',
        taxAmountRub: '40.00',
        providerIncomeAmountRub: '965.00',
        providerFeeAmountRub: '35.00',
        netReferralBaseRub: '925.00',
        rewardAmountRub: '462.50',
        rewardPercent: 50,
        paymentMethodType: 'bank_card',
        calculationVersion: REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION,
    }

    it('stores actual-income calculation metadata and awards its reward amount exactly once', async () => {
        const referrer = { id: 'referrer-1', referralBonusBalanceRub: 0, totalReferralBonusRub: 0 }
        const referred = { id: 'referred-1', referredByUserId: referrer.id }
        const { service, referralBonusRepository, dataSource } = createService([referrer, referred])

        const first = await service.awardPaymentBonus({
            userId: referred.id,
            subscriptionId: 'sub-1',
            paymentId: '00000000-0000-4000-8000-000000000010',
            amountRub: 1000,
            rewardCalculation: netCalculation,
        })
        const duplicate = await service.awardPaymentBonus({
            userId: referred.id,
            subscriptionId: 'sub-1',
            paymentId: '00000000-0000-4000-8000-000000000010',
            amountRub: 1000,
            rewardCalculation: { ...netCalculation, rewardAmountRub: '1.00' },
        })

        expect(first).toMatchObject({
            bonusRub: 462.5,
            bonusPercent: 50,
            grossAmountRub: 1000,
            taxAmountRub: 40,
            providerIncomeAmountRub: 965,
            providerFeeAmountRub: 35,
            netReferralBaseRub: 925,
            paymentMethodType: 'bank_card',
            calculationVersion: REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION,
            status: ReferralRewardStatusEnum.AWARDED,
        })
        expect(duplicate).toBe(first)
        expect(referrer.referralBonusBalanceRub).toBe(462.5)
        expect(referralBonusRepository.rows).toHaveLength(1)
        expect(dataSource.transaction).toHaveBeenCalledTimes(2)
    })

    it.each([
        ['bank_card', '21'],
        ['sbp', '22'],
        ['cash_like_future_method', '23'],
    ])('awards the same fallback exactly once for %s', async (paymentMethodType, paymentIdSuffix) => {
        const referrer = { id: 'referrer-1', referralBonusBalanceRub: 0, totalReferralBonusRub: 0 }
        const referred = { id: 'referred-1', referredByUserId: referrer.id }
        const { service, referralBonusRepository } = createService([referrer, referred])
        const input = {
            userId: referred.id,
            subscriptionId: 'sub-1',
            paymentId: `00000000-0000-4000-8000-0000000000${paymentIdSuffix}`,
            amountRub: 1000,
            rewardCalculation: {
                status: 'CALCULATED' as const,
                grossAmountRub: '1000.00',
                taxAmountRub: '40.00',
                providerIncomeAmountRub: null,
                providerFeeAmountRub: '35.00',
                netReferralBaseRub: '925.00',
                rewardAmountRub: '462.50',
                rewardPercent: 50,
                paymentMethodType,
                calculationVersion: REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION,
            },
        }

        const first = await service.awardPaymentBonus(input)
        const duplicate = await service.awardPaymentBonus(input)

        expect(first).toMatchObject({
            bonusRub: 462.5,
            taxAmountRub: 40,
            providerIncomeAmountRub: null,
            providerFeeAmountRub: 35,
            netReferralBaseRub: 925,
            paymentMethodType,
            calculationVersion: REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION,
            status: ReferralRewardStatusEnum.AWARDED,
        })
        expect(duplicate).toBe(first)
        expect(referrer.referralBonusBalanceRub).toBe(462.5)
        expect(referrer.totalReferralBonusRub).toBe(462.5)
        expect(referralBonusRepository.rows).toHaveLength(1)
    })

    it('preserves the explicit legacy calculation-pending contract for unresolved non-calculator cases', async () => {
        const referrer = { id: 'referrer-1', referralBonusBalanceRub: 0, totalReferralBonusRub: 0 }
        const referred = { id: 'referred-1', referredByUserId: referrer.id }
        const { service, referralBonusRepository, notificationService } = createService([referrer, referred])
        const input = {
            userId: referred.id,
            subscriptionId: 'sub-1',
            paymentId: '00000000-0000-4000-8000-000000000011',
            amountRub: 1000,
            rewardCalculation: {
                status: 'PENDING' as const,
                grossAmountRub: '1000.00',
                rewardPercent: 50,
                paymentMethodType: 'legacy_unresolved',
                calculationVersion: 'net-v2',
                errorCode: 'PROVIDER_INCOME_UNAVAILABLE' as const,
            },
        }

        const first = await service.awardPaymentBonus(input)
        const duplicate = await service.awardPaymentBonus(input)

        expect(first).toMatchObject({
            bonusRub: 0,
            status: ReferralRewardStatusEnum.CALCULATION_PENDING,
            calculationErrorCode: 'PROVIDER_INCOME_UNAVAILABLE',
            paymentMethodType: 'legacy_unresolved',
            calculationVersion: 'net-v2',
        })
        expect(duplicate).toBe(first)
        expect(referrer.referralBonusBalanceRub).toBe(0)
        expect(referrer.totalReferralBonusRub).toBe(0)
        expect(referralBonusRepository.rows).toHaveLength(1)
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('returns an existing historical ledger row without requiring new nullable metadata', async () => {
        const legacy = {
            id: 'legacy-ledger',
            paymentId: '00000000-0000-4000-8000-000000000012',
            bonusRub: 49.5,
            bonusPercent: 50,
            status: ReferralRewardStatusEnum.AWARDED,
        }
        const { service } = createService([{ id: 'legacy-referred', referredByUserId: 'legacy-referrer' }], [legacy])

        await expect(
            service.awardPaymentBonus({
                userId: 'legacy-referred',
                paymentId: legacy.paymentId,
                amountRub: 99,
                rewardCalculation: netCalculation,
            }),
        ).resolves.toBe(legacy)
        expect(legacy).not.toHaveProperty('calculationVersion')
    })

    it('awards 50 percent from every successful referred payment and keeps payment idempotent', async () => {
        const referrer = {
            id: 'referrer-1',
            referralBonusBalanceRub: 0,
            totalReferralBonusRub: 0,
            telegramId: 5460431051,
        }
        const referred = {
            id: 'referred-1',
            referredByUserId: referrer.id,
        }
        const { service, referralBonusRepository, analyticsService, notificationService } = createService([
            referrer,
            referred,
        ])

        const first = await service.awardPaymentBonus({
            userId: referred.id,
            subscriptionId: 'sub-1',
            paymentId: '00000000-0000-0000-0000-000000000001',
            amountRub: 99,
            paidAt: new Date('2026-06-13T12:00:00.000Z'),
        })
        const duplicate = await service.awardPaymentBonus({
            userId: referred.id,
            subscriptionId: 'sub-1',
            paymentId: '00000000-0000-0000-0000-000000000001',
            amountRub: 99,
            paidAt: new Date('2026-06-13T12:00:00.000Z'),
        })
        await service.awardPaymentBonus({
            userId: referred.id,
            subscriptionId: 'sub-1',
            paymentId: '00000000-0000-0000-0000-000000000002',
            amountRub: 149,
            paidAt: new Date('2026-06-14T12:00:00.000Z'),
        })

        expect(first).toEqual(
            expect.objectContaining({
                bonusRub: 49.5,
                bonusPercent: 50,
                status: ReferralRewardStatusEnum.AWARDED,
            }),
        )
        expect(duplicate).toBe(first)
        expect(referrer.referralBonusBalanceRub).toBe(124)
        expect(referrer.totalReferralBonusRub).toBe(124)
        expect(referralBonusRepository.rows).toHaveLength(2)
        expect(analyticsService.trackReferralFriendPaid).toHaveBeenCalledTimes(2)
        expect(notificationService.notify).toHaveBeenCalledTimes(2)
    })

    it('returns referral interface stats for invited users and bonus totals', async () => {
        const referrer = {
            id: 'referrer-1',
            referralCode: 'ref_referrer',
            referralBonusBalanceRub: 49.5,
            totalReferralBonusRub: 124,
        }
        const { service } = createService([
            referrer,
            {
                id: 'referred-1',
                referredByUserId: referrer.id,
                firstPaidAt: new Date('2026-06-21T10:00:00.000Z'),
                subscription: { status: StatusesEnum.ACTIVE },
            },
            {
                id: 'referred-2',
                referredByUserId: referrer.id,
                subscription: { status: StatusesEnum.GRACE },
            },
            { id: 'unrelated-1' },
        ])

        await expect(service.getReferralStats(referrer.id)).resolves.toEqual({
            referralCode: 'ref_referrer',
            telegramBotStartUrl: 'https://t.me/your_vpn_bot?start=',
            invitedCount: 2,
            invitedPaidCount: 1,
            activeInvitedCount: 2,
            bonusBalanceRub: 49.5,
            totalBonusRub: 124,
        })
    })

    it('redeems only a full bonus payment amount and rejects insufficient balance', async () => {
        const user = {
            id: 'user-1',
            referralBonusBalanceRub: 149,
        }
        const { service } = createService([user])

        await expect(service.redeemFullPayment(user.id, 99)).resolves.toEqual({
            redeemedRub: 99,
            balanceRub: 50,
        })
        expect(user.referralBonusBalanceRub).toBe(50)
        await expect(service.redeemFullPayment(user.id, 99)).rejects.toThrow('FORBIDDEN')
    })
})
