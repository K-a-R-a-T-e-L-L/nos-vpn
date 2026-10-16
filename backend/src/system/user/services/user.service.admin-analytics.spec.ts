import { NotFoundException } from '@nestjs/common'

import { UserAdminService } from './user-admin.service'

describe('UserService admin analytics', () => {
    const query = jest.fn()
    const service = Object.create(UserAdminService.prototype) as any
    service.userRepository = { query }

    beforeEach(() => query.mockReset())

    it('queries users with server pagination, SQL money aggregate and no Remnawave calls', async () => {
        query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([
            {
                id: '11111111-1111-4111-8111-111111111111',
                email: 'safe@example.com',
                telegramUsername: 'safe',
                createdAt: new Date(),
                role: 'USER',
                isBlocked: false,
                subscriptionId: null,
                successfulPaidTotal: '12.50',
                successfulPayments: '1',
                referredUsersCount: '0',
                wasReferred: false,
            },
        ])
        const result = await service.queryAdminUsers({
            page: 1,
            pageSize: 25,
            sortBy: 'successfulPaidTotal',
            sortDir: 'DESC',
        })
        expect(query.mock.calls[1][0]).toContain('SUM(p.amount::numeric)')
        expect(query.mock.calls[1][0]).toContain('LIMIT')
        expect(result.items[0]).not.toHaveProperty('passwordHash')
        expect(result.items[0].successfulPaidTotal).toBe('12.50')
    })

    it('returns 404 for missing details and never loads a raw User entity', async () => {
        query.mockResolvedValueOnce([])
        await expect(service.getAdminUserDetails('11111111-1111-4111-8111-111111111111', 1, 25)).rejects.toBeInstanceOf(
            NotFoundException,
        )
        expect(query).toHaveBeenCalledTimes(1)
    })

    it('parameterizes the complete filter set and whitelists deterministic sorting', async () => {
        query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([])
        await service.queryAdminUsers({
            search: "x' OR 1=1 --",
            userId: '11111111-1111-4111-8111-111111111111',
            telegramId: '12345',
            registeredFrom: '2026-01-01T00:00:00.000Z',
            registeredTo: '2026-02-01T00:00:00.000Z',
            role: 'ADMIN',
            blocked: false,
            authChannel: 'BOTH',
            subscriptionState: 'ACTIVE',
            planId: '22222222-2222-4222-8222-222222222222',
            expiresBefore: '2026-03-01T00:00:00.000Z',
            expiresAfter: '2026-01-01T00:00:00.000Z',
            autoRenewEnabled: true,
            paymentState: 'EVER_PAID',
            referralState: 'IS_REFERRER',
            promoCode: 'SAVE',
            page: 1,
            pageSize: 25,
            sortBy: 'lastPaidAt',
            sortDir: 'ASC',
        })
        const [sql, parameters] = query.mock.calls[1]
        expect(sql).not.toContain("x' OR 1=1 --")
        expect(parameters).toContain("%x' or 1=1 --%")
        expect(sql).toContain('u.telegram_id::text =')
        expect(sql).toContain('s.auto_renew_enabled =')
        expect(sql).toContain('EXISTS (SELECT 1 FROM promo_usage')
        expect(sql).toContain('ORDER BY a."lastPaidAt" ASC NULLS LAST, a.id ASC')
        expect(sql).not.toMatch(/remnawave|subscription_url|provider_external/i)
    })

    it('builds safe details with fixed query count, pagination and no secret fields', async () => {
        const profile = {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'safe@example.com',
            telegramUsername: 'safe',
            telegramId: '999',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            role: 'USER',
            isBlocked: false,
            subscriptionState: 'ACTIVE',
            subscriptionStatus: 'ACTIVE',
            planId: 'plan-1',
            planTitle: 'Plan',
            successfulPaidTotal: '10.00',
            successfulPayments: '1',
            referredUsersCount: '1',
            wasReferred: true,
        }
        query
            .mockResolvedValueOnce([profile])
            .mockResolvedValueOnce([{ total: '1' }])
            .mockResolvedValueOnce([
                {
                    id: 'payment-12345678',
                    createdAt: new Date(),
                    amount: '10.00',
                    currency: 'RUB',
                    status: 'SUCCEEDED',
                    provider: 'YOOKASSA',
                    paymentType: 'FIRST_PURCHASE',
                    providerPaymentId: 'forbidden',
                    paymentUrl: 'forbidden',
                },
            ])
            .mockResolvedValueOnce([{ promoCode: 'SAVE', status: 'APPLIED', appliedAt: new Date() }])
            .mockResolvedValueOnce([
                {
                    referredUsersCount: '1',
                    referredPayingUsers: '1',
                    awardedBonusTotal: '5.00',
                    currentWalletBalance: '5.00',
                },
            ])
            .mockResolvedValueOnce([{ status: 'OPEN', messagesCount: '2', lastMessageAt: new Date() }])

        const result = await service.getAdminUserDetails(profile.id, 2, 50)
        expect(query).toHaveBeenCalledTimes(6)
        expect(query.mock.calls[2][0]).toContain('LIMIT $2 OFFSET $3')
        expect(query.mock.calls[2][1]).toEqual([profile.id, 50, 50])
        expect(result.paymentHistory[0]).not.toHaveProperty('providerPaymentId')
        expect(result.paymentHistory[0]).not.toHaveProperty('paymentUrl')
        expect(JSON.stringify(result)).not.toMatch(/subscriptionUrl|passwordHash|paymentMethodId|providerExternalId/)
        expect(result).toMatchObject({ paymentTotal: 1, paymentPage: 2, paymentPageSize: 50 })
    })
})
