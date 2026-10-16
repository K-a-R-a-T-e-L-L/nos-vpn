import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'

import { PlategaRecurrentAgreementService } from './platega-recurrent-agreement.service'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PlategaRecurrentPlanPolicy } from '../providers/platega-recurrent-plan.policy'

describe('PlategaRecurrentAgreementService', () => {
    const agreements = { find: jest.fn(), findOne: jest.fn(), create: jest.fn((value) => value), save: jest.fn() }
    const plans = { findOne: jest.fn() }
    const subscriptions = { findOne: jest.fn() }
    const provider = { createSubscription: jest.fn(), getSubscription: jest.fn(), cancelSubscription: jest.fn(), isConfigured: jest.fn() }
    const policy = { map: jest.fn() }
    const config = { get: jest.fn() }
    const service = new PlategaRecurrentAgreementService(
        config as any,
        agreements as any,
        plans as any,
        subscriptions as any,
        provider as any,
        policy as any,
    )

    beforeEach(() => {
        jest.clearAllMocks()
        config.get.mockReturnValue('false')
        provider.isConfigured.mockReturnValue(true)
    })

    it('fails create and own-read closed while the feature is off', async () => {
        await expect(service.create('user-1', { planId: 'plan-1', consent: true }, 'idem-1')).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        )
        await expect(service.readOwn('agreement-1', 'user-1')).rejects.toBeInstanceOf(ServiceUnavailableException)
        expect(agreements.findOne).not.toHaveBeenCalled()
    })

    it('derives commercial terms through policy and never accepts client amount or interval', async () => {
        config.get.mockReturnValue('true')
        plans.findOne.mockResolvedValue({ id: 'plan-1', name: '90 days', period: 90, amount: 990, isActive: true })
        subscriptions.findOne.mockResolvedValue({ id: 'sub-1', userId: 'user-1' })
        policy.map.mockImplementation(() => {
            throw new Error('exact-day plans unsupported')
        })

        await expect(service.create('user-1', { planId: 'plan-1', consent: true }, 'idem-1')).rejects.toThrow('exact-day')
        expect(provider.createSubscription).not.toHaveBeenCalled()
    })

    it.each([
        { period: 30, code: 'vpn_custom_monthly', devicesLimit: 1 },
        { period: 360, code: 'vpn_custom_yearly', devicesLimit: 1 },
    ])('rejects a custom active %s-day plan before provider creation', async ({ period, code, devicesLimit }) => {
        config.get.mockReturnValue('true')
        plans.findOne.mockResolvedValue({
            id: 'plan-custom',
            name: 'Custom plan',
            period,
            amount: 990,
            code,
            devicesLimit,
            isActive: true,
        })
        subscriptions.findOne.mockResolvedValue({ id: 'sub-1', userId: 'user-1' })
        const guardedService = new PlategaRecurrentAgreementService(
            config as any,
            agreements as any,
            plans as any,
            subscriptions as any,
            provider as any,
            new PlategaRecurrentPlanPolicy(),
        )

        await expect(guardedService.create('user-1', { planId: 'plan-custom', consent: true }, 'idem-custom')).rejects.toThrow(
            'non-canonical',
        )
        expect(provider.createSubscription).not.toHaveBeenCalled()
    })

    it('uses only server-derived terms and the server-owned SITE merchant when policy approves a future mapping', async () => {
        config.get.mockReturnValue('true')
        agreements.findOne.mockResolvedValue(null)
        plans.findOne.mockResolvedValue({
            id: 'plan-1',
            name: 'Future verified plan',
            code: 'vpn_30_1',
            period: 30,
            amount: 990,
            devicesLimit: 1,
            isActive: true,
        })
        subscriptions.findOne.mockResolvedValue({ id: 'sub-1', userId: 'user-1' })
        policy.map.mockReturnValue({ amount: 990, currency: 'RUB', interval: 3, intervalCount: 1, durationDays: 30 })
        agreements.save.mockImplementation(async (value) => ({ id: 'agreement-1', createdAt: new Date(), ...value }))
        provider.createSubscription.mockResolvedValue({
            providerSubscriptionId: 'provider-1',
            status: 'PendingAgreement',
            redirect: 'https://pay.example/1',
        })

        await service.create('user-1', { planId: 'plan-1', consent: true }, 'idem-1')

        expect(provider.createSubscription).toHaveBeenCalledWith({
            merchantProfile: 'web',
            amount: 990,
            currency: 'RUB',
            interval: 3,
            intervalCount: 1,
            description: 'NOS VPN Future verified plan',
        })
        expect(agreements.create).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 990,
                durationDays: 30,
                merchant: PaymentMerchant.SITE,
                consentLegalVersion: '2.1',
                consentAcceptedAt: expect.any(Date),
            }),
        )
    })

    it('rejects a website agreement without explicit consent before provider creation', async () => {
        config.get.mockReturnValue('true')
        await expect(service.create('user-1', { planId: 'plan-1' } as any, 'idem-1')).rejects.toThrow('consent')
        expect(provider.createSubscription).not.toHaveBeenCalled()
    })

    it('rejects a recurrent create when the selected merchant is not configured', async () => {
        config.get.mockReturnValue('true')
        provider.isConfigured.mockReturnValue(false)
        await expect(service.create('user-1', { planId: 'plan-1', consent: true }, 'idem-1')).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        )
        expect(provider.createSubscription).not.toHaveBeenCalled()
    })

    it('returns a duplicate create operation without another provider mandate', async () => {
        config.get.mockReturnValue('true')
        const originalConsentAt = new Date('2026-09-10T12:00:00Z')
        agreements.findOne.mockResolvedValue({
            id: 'agreement-1', merchant: PaymentMerchant.SITE, consentAcceptedAt: originalConsentAt, consentLegalVersion: '2.1',
        })
        await service.create('user-1', { planId: 'plan-1', consent: true }, 'idem-1')
        expect(provider.createSubscription).not.toHaveBeenCalled()
        expect(plans.findOne).not.toHaveBeenCalled()
        expect(agreements.save).not.toHaveBeenCalled()
    })

    it('enforces ownership and returns only the safe read model', async () => {
        config.get.mockReturnValue('true')
        agreements.findOne.mockResolvedValue({
            id: 'agreement-1',
            userId: 'user-1',
            providerSubscriptionId: 'provider-1',
            normalizedStatus: 'ACTIVE',
            rawProviderStatus: 'Active',
            amount: 500,
            currency: 'RUB',
            durationDays: 30,
            nextChargeAt: null,
            lastChargeAt: null,
            cancelledAt: null,
            createdAt: new Date('2026-01-01Z'),
            merchant: PaymentMerchant.SITE,
        })
        const result = await service.readOwn('agreement-1', 'user-1')
        expect(result).not.toHaveProperty('planSnapshot')
        expect(result).not.toHaveProperty('createIdempotencyKey')
        expect(result).toMatchObject({ id: 'agreement-1', providerSubscriptionId: 'provider-1' })
    })

    it('keeps admin cancellation idempotent and never edits the paid subscription', async () => {
        agreements.findOne.mockResolvedValue({
            ...({ id: 'agreement-1', normalizedStatus: 'CANCELLED', merchant: PaymentMerchant.SITE } as any),
        })
        await service.cancelByAdmin('agreement-1')
        expect(provider.cancelSubscription).not.toHaveBeenCalled()
        expect(subscriptions).not.toHaveProperty('save')
    })

    it('lists a user\'s agreements newest first as a safe server-derived read model', async () => {
        agreements.find.mockResolvedValue([
            {
                id: 'agreement-new',
                userId: 'user-1',
                merchant: PaymentMerchant.BOT,
                normalizedStatus: 'PAST_DUE',
                rawProviderStatus: 'PastDue',
                planId: 'plan-1',
                planSnapshot: { name: '1 устройство · 1 месяц', period: 30 },
                amount: 500,
                currency: 'RUB',
                providerInterval: 3,
                intervalCount: 1,
                nextChargeAt: new Date('2026-11-01T00:00:00Z'),
                lastChargeAt: new Date('2026-10-01T00:00:00Z'),
                createdAt: new Date('2026-10-02T00:00:00Z'),
                metadataSnapshot: { forbidden: true },
            },
        ])

        const result = await service.listForAdminUser('user-1')

        expect(agreements.find).toHaveBeenCalledWith({ where: { userId: 'user-1' }, order: { createdAt: 'DESC' } })
        expect(result).toEqual([
            expect.objectContaining({
                id: 'agreement-new',
                userId: 'user-1',
                cadence: 'MONTHLY',
                planName: '1 устройство · 1 месяц',
            }),
        ])
        expect(result[0]).not.toHaveProperty('planSnapshot')
        expect(result[0]).not.toHaveProperty('metadataSnapshot')
        expect(result[0]).not.toHaveProperty('providerSubscriptionId')
    })

    it('returns an empty safe list when the user has no recurrent agreements', async () => {
        agreements.find.mockResolvedValue([])

        await expect(service.listForAdminUser('user-1')).resolves.toEqual([])
        expect(agreements.find).toHaveBeenCalledWith({ where: { userId: 'user-1' }, order: { createdAt: 'DESC' } })
    })

    it.each([
        ['cancelForAdminUser', 'cancelSubscription'],
        ['reconcileForAdminUser', 'getSubscription'],
    ])('rejects wrong-user %s before the provider is called', async (method, providerMethod) => {
        agreements.findOne.mockResolvedValue(null)

        await expect((service as any)[method]('user-1', 'agreement-other')).rejects.toBeInstanceOf(NotFoundException)

        expect(agreements.findOne).toHaveBeenCalledWith({ where: { id: 'agreement-other', userId: 'user-1' } })
        expect(provider[providerMethod]).not.toHaveBeenCalled()
    })

    it('reconciles a user-owned agreement without creating a payment or extending subscription access', async () => {
        const agreement = {
            id: 'agreement-1',
            userId: 'user-1',
            providerSubscriptionId: 'provider-1',
            merchant: PaymentMerchant.SITE,
            amount: 500,
            currency: 'RUB',
            providerInterval: 3,
            intervalCount: 1,
            normalizedStatus: 'PAST_DUE',
            nextChargeAt: new Date('2026-11-01T00:00:00Z'),
            createdAt: new Date(),
        }
        agreements.findOne.mockResolvedValue(agreement)
        provider.getSubscription.mockResolvedValue({ providerSubscriptionId: 'provider-1', status: 'Active' })
        agreements.save.mockImplementation(async (value) => value)

        await service.reconcileForAdminUser('user-1', 'agreement-1')

        expect(provider.getSubscription).toHaveBeenCalledWith('provider-1', 'web')
        expect(subscriptions).not.toHaveProperty('save')
        expect(provider.createSubscription).not.toHaveBeenCalled()
    })

    it('cancels an owned agreement through its frozen merchant while the recurrent feature flag is false', async () => {
        const agreement = {
            id: 'agreement-1', userId: 'user-1', providerSubscriptionId: 'provider-1', merchant: PaymentMerchant.BOT,
            normalizedStatus: 'ACTIVE', amount: 500, currency: 'RUB', providerInterval: 3, intervalCount: 1,
            planId: 'plan-1', planSnapshot: {}, createdAt: new Date(),
        }
        agreements.findOne.mockResolvedValue(agreement)
        agreements.save.mockImplementation(async (value) => value)
        provider.cancelSubscription.mockResolvedValue({ providerSubscriptionId: 'provider-1', status: 'Cancelled' })

        await service.cancelForAdminUser('user-1', 'agreement-1')

        expect(provider.cancelSubscription).toHaveBeenCalledWith('provider-1', 'bot')
        expect(subscriptions).not.toHaveProperty('save')
    })

    it('derives only verified monthly/yearly cadence and preserves paid-through when a terminal snapshot omits it', async () => {
        const yearly = {
            id: 'agreement-yearly', userId: 'user-1', merchant: PaymentMerchant.SITE, normalizedStatus: 'CANCELLED',
            planId: 'plan-1', planSnapshot: {}, amount: 500, currency: 'RUB', providerInterval: 4, intervalCount: 1,
            nextChargeAt: new Date('2027-10-01T00:00:00Z'), createdAt: new Date(),
        }
        const legacy = {
            ...yearly, id: 'agreement-legacy', providerInterval: 3, intervalCount: 2,
        }
        agreements.find.mockResolvedValue([yearly, legacy])

        const result = await service.listForAdminUser('user-1')
        service.applySnapshot(yearly as any, { providerSubscriptionId: 'provider-1', status: 'Cancelled', nextChargeAt: null })

        expect(result.map((item) => item.cadence)).toEqual(['YEARLY', null])
        expect(yearly.nextChargeAt).toEqual(new Date('2027-10-01T00:00:00Z'))
    })
})
