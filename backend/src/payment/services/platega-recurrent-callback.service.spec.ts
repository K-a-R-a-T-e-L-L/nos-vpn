import { BadRequestException } from '@nestjs/common'

import { PlategaRecurrentCallbackService } from './platega-recurrent-callback.service'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'

describe('PlategaRecurrentCallbackService', () => {
    const provider = { verifyCallback: jest.fn().mockReturnValue('web'), getSubscription: jest.fn() }
    const agreements = { findOne: jest.fn(), save: jest.fn(async (value) => value) }
    const payments = {
        findOne: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ id: 'payment-1', ...value })),
    }
    const events = {
        findOne: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ id: 'event-1', ...value })),
    }
    const canonical = { processConfirmedPlategaRecurrentCharge: jest.fn() }
    const service = new PlategaRecurrentCallbackService(
        provider as any,
        agreements as any,
        payments as any,
        events as any,
        canonical as any,
    )
    const agreement = {
        id: 'agreement-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        planId: 'plan-1',
        providerSubscriptionId: 'provider-sub-1',
        merchant: PaymentMerchant.SITE,
        amount: 500,
        currency: 'RUB',
        durationDays: 90,
        normalizedStatus: 'ACTIVE',
        planSnapshot: { name: '90 days' },
    }

    beforeEach(() => {
        jest.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z') })
        jest.clearAllMocks()
        provider.verifyCallback.mockReturnValue('web')
        agreements.findOne.mockResolvedValue({ ...agreement })
        events.findOne.mockResolvedValue(null)
        payments.findOne.mockResolvedValue(null)
    })

    afterEach(() => jest.useRealTimers())

    it('authenticates and updates mandate state without invoking paid activation', async () => {
        await service.handleSubscriptionStatus(
            {
                Id: 'provider-sub-1',
                SubscriptionId: 'provider-sub-1',
                Amount: 500,
                Currency: 'RUB',
                PaymentMethod: 6,
                Status: 'SUBSCRIPTION_CANCELLED',
                NextChargeAt: '2026-10-01T00:00:00Z',
            },
            { 'x-secret': 'valid' },
        )
        expect(provider.verifyCallback).toHaveBeenCalled()
        expect(agreements.save).toHaveBeenCalledWith(expect.objectContaining({ normalizedStatus: 'CANCELLED' }))
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })

    it('accepts activation as mandate state only', async () => {
        await service.handleSubscriptionStatus(
            {
                Id: 'provider-sub-1',
                SubscriptionId: 'provider-sub-1',
                Amount: 500,
                Currency: 'RUB',
                PaymentMethod: 6,
                Status: 'SUBSCRIPTION_ACTIVATED',
            },
            {},
        )
        expect(agreements.save).toHaveBeenCalledWith(expect.objectContaining({ normalizedStatus: 'ACTIVE' }))
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })

    it('preserves an unknown raw mandate status without granting access or replacing proven state', async () => {
        await service.handleSubscriptionStatus(
            {
                Id: 'provider-sub-1',
                SubscriptionId: 'provider-sub-1',
                Amount: 500,
                Currency: 'RUB',
                PaymentMethod: 6,
                Status: 'SOMETHING_NEW',
            },
            {},
        )
        expect(agreements.save).toHaveBeenCalledWith(
            expect.objectContaining({ normalizedStatus: 'ACTIVE', rawProviderStatus: 'SOMETHING_NEW' }),
        )
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })

    it('reconciles an ambiguous PAST_DUE to ACTIVE ordering through provider GET', async () => {
        agreements.findOne.mockResolvedValue({ ...agreement, normalizedStatus: 'PAST_DUE' })
        provider.getSubscription.mockResolvedValue({
            providerSubscriptionId: 'provider-sub-1',
            status: 'PastDue',
            nextChargeAt: '2026-10-02T00:00:00Z',
        })
        await service.handleSubscriptionStatus(
            {
                Id: 'provider-sub-1',
                SubscriptionId: 'provider-sub-1',
                Amount: 500,
                Currency: 'RUB',
                PaymentMethod: 6,
                Status: 'SUBSCRIPTION_ACTIVATED',
            },
            {},
        )
        expect(provider.getSubscription).toHaveBeenCalledWith('provider-sub-1', 'web')
        expect(agreements.save).toHaveBeenCalledWith(expect.objectContaining({ normalizedStatus: 'PAST_DUE' }))
    })

    it('rejects callback authentication before any lookup or audit write', async () => {
        provider.verifyCallback.mockImplementation(() => {
            throw new Error('FORBIDDEN')
        })
        await expect(
            service.handleCharge(
                {
                    Id: 'charge-1',
                    Amount: 500,
                    Currency: 'RUB',
                    Status: 'CONFIRMED',
                    PaymentMethod: 6,
                    SubscriptionId: 'provider-sub-1',
                },
                {},
            ),
        ).rejects.toThrow('FORBIDDEN')
        expect(agreements.findOne).not.toHaveBeenCalled()
        expect(events.save).not.toHaveBeenCalled()
    })

    it('rejects mismatched subscription-status identifiers', async () => {
        await expect(
            service.handleSubscriptionStatus(
                {
                    Id: 'one',
                    SubscriptionId: 'two',
                    Amount: 500,
                    Currency: 'RUB',
                    PaymentMethod: 6,
                    Status: 'SUBSCRIPTION_ACTIVATED',
                },
                {},
            ),
        ).rejects.toThrow('identifiers mismatch')
        expect(agreements.save).not.toHaveBeenCalled()
    })

    it.each([
        ['PaymentMethod', { PaymentMethod: 2 }],
        ['amount', { Amount: 499 }],
        ['currency', { Currency: 'USD' }],
        ['subscription', { SubscriptionId: 'other' }],
    ])('rejects a charge with wrong %s', async (_label, patch) => {
        await expect(
            service.handleCharge(
                {
                    Id: 'charge-1',
                    Amount: 500,
                    Currency: 'RUB',
                    Status: 'CONFIRMED',
                    PaymentMethod: 6,
                    SubscriptionId: 'provider-sub-1',
                    NextChargeAt: null,
                    ...patch,
                },
                {},
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })

    it('records a confirmed charge with frozen terms and sends it once through canonical activation', async () => {
        await service.handleCharge(
            {
                Id: 'charge-1',
                Amount: 500,
                Currency: 'RUB',
                Status: 'CONFIRMED',
                PaymentMethod: 6,
                SubscriptionId: 'provider-sub-1',
                NextChargeAt: '2026-10-01T00:00:00Z',
            },
            {},
        )
        expect(payments.create).toHaveBeenCalledWith(
            expect.objectContaining({
                providerPaymentId: 'charge-1',
                status: PaymentStatusEnum.PENDING,
                isRecurring: true,
                metadataSnapshot: expect.objectContaining({
                    recurrent_duration_days: 90,
                    platega_recurrent_agreement_id: 'agreement-1',
                }),
            }),
        )
        expect(canonical.processConfirmedPlategaRecurrentCharge).toHaveBeenCalledWith(
            'payment-1',
            new Date('2026-10-01T00:00:00Z'),
        )
    })

    it('does not persist rejected confirmed paid-through state before canonical success', async () => {
        const persistedAgreement = { ...agreement, nextChargeAt: new Date('2031-01-01T00:00:00Z'), lastChargeAt: null }
        agreements.findOne.mockResolvedValue(persistedAgreement)
        canonical.processConfirmedPlategaRecurrentCharge.mockRejectedValueOnce(
            new BadRequestException('Recurrent paid-through boundary must strictly advance existing access'),
        )
        const rejectedBoundary = '2030-12-01T00:00:00Z'

        await expect(service.handleCharge({
            Id: 'charge-rejected', Amount: 500, Currency: 'RUB', Status: 'CONFIRMED', PaymentMethod: 6,
            SubscriptionId: 'provider-sub-1', NextChargeAt: rejectedBoundary,
        }, {})).rejects.toThrow('strictly advance existing access')

        expect(canonical.processConfirmedPlategaRecurrentCharge).toHaveBeenCalledWith('payment-1', new Date(rejectedBoundary))
        expect(persistedAgreement.nextChargeAt).toEqual(new Date('2031-01-01T00:00:00Z'))
        expect(persistedAgreement.lastChargeAt).toBeNull()
        expect(agreements.save).not.toHaveBeenCalled()
        expect(events.save).toHaveBeenCalledWith(expect.objectContaining({ processed: false, processingError: expect.any(String) }))
        expect(events.save).not.toHaveBeenCalledWith(expect.objectContaining({ processed: true }))
    })

    it.each([undefined, 'not-a-date', '2020-01-01T00:00:00Z'])('rejects an unusable successful paid-through boundary: %s', async (nextChargeAt) => {
        await expect(
            service.handleCharge(
                {
                    Id: 'charge-1', Amount: 500, Currency: 'RUB', Status: 'CONFIRMED', PaymentMethod: 6,
                    SubscriptionId: 'provider-sub-1', NextChargeAt: nextChargeAt,
                } as any,
                {},
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })

    it.each(['CANCELED', 'FAILED', 'CHARGEBACKED', 'FUTURE_STATUS'])('%s never grants access', async (status) => {
        await service.handleCharge(
            {
                Id: 'charge-1',
                Amount: 500,
                Currency: 'RUB',
                Status: status,
                PaymentMethod: 6,
                SubscriptionId: 'provider-sub-1',
                NextChargeAt: null,
            },
            {},
        )
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })

    it('retries an unprocessed duplicate event and relies on canonical payment locking for exactly-once extension', async () => {
        events.findOne.mockResolvedValue({ id: 'event-1', processed: false })
        payments.findOne.mockResolvedValue({ id: 'payment-1', status: PaymentStatusEnum.PENDING })
        await service.handleCharge(
            {
                Id: 'charge-1',
                Amount: 500,
                Currency: 'RUB',
                Status: 'CONFIRMED',
                PaymentMethod: 6,
                SubscriptionId: 'provider-sub-1',
                NextChargeAt: '2026-10-01T00:00:00Z',
            },
            {},
        )
        expect(payments.save).not.toHaveBeenCalled()
        expect(canonical.processConfirmedPlategaRecurrentCharge).toHaveBeenCalledWith(
            'payment-1',
            new Date('2026-10-01T00:00:00Z'),
        )
    })

    it('acknowledges an already processed duplicate without touching payment or access', async () => {
        events.findOne.mockResolvedValue({ id: 'event-1', processed: true })
        await service.handleCharge(
            {
                Id: 'charge-1',
                Amount: 500,
                Currency: 'RUB',
                Status: 'CONFIRMED',
                PaymentMethod: 6,
                SubscriptionId: 'provider-sub-1',
                NextChargeAt: '2026-10-01T00:00:00Z',
            },
            {},
        )
        expect(payments.findOne).not.toHaveBeenCalled()
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })

    it('lets two distinct confirmed charge IDs reach canonical activation independently', async () => {
        await service.handleCharge(
            {
                Id: 'charge-1',
                Amount: 500,
                Currency: 'RUB',
                Status: 'CONFIRMED',
                PaymentMethod: 6,
                SubscriptionId: 'provider-sub-1',
                NextChargeAt: '2026-10-01T00:00:00Z',
            },
            {},
        )
        payments.save.mockResolvedValueOnce({ id: 'payment-2' })
        await service.handleCharge(
            {
                Id: 'charge-2',
                Amount: 500,
                Currency: 'RUB',
                Status: 'CONFIRMED',
                PaymentMethod: 6,
                SubscriptionId: 'provider-sub-1',
                NextChargeAt: '2026-11-01T00:00:00Z',
            },
            {},
        )
        expect(canonical.processConfirmedPlategaRecurrentCharge).toHaveBeenNthCalledWith(
            1,
            'payment-1',
            new Date('2026-10-01T00:00:00Z'),
        )
        expect(canonical.processConfirmedPlategaRecurrentCharge).toHaveBeenNthCalledWith(
            2,
            'payment-2',
            new Date('2026-11-01T00:00:00Z'),
        )
    })

    it('records a verified chargeback without attempting to revoke already-paid access', async () => {
        payments.findOne.mockResolvedValue({ id: 'payment-1', status: PaymentStatusEnum.SUCCEEDED })
        await service.handleCharge(
            {
                Id: 'charge-1',
                Amount: 500,
                Currency: 'RUB',
                Status: 'CHARGEBACKED',
                PaymentMethod: 6,
                SubscriptionId: 'provider-sub-1',
            },
            {},
        )
        expect(payments.save).toHaveBeenCalledWith(expect.objectContaining({ status: PaymentStatusEnum.REFUNDED }))
        expect(canonical.processConfirmedPlategaRecurrentCharge).not.toHaveBeenCalled()
    })
})
