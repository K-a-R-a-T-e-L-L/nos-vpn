import { PlategaRecurrentProvider } from './platega-recurrent.provider'

describe('PlategaRecurrentProvider', () => {
    const transport = {
        requestApi: jest.fn(),
        verifyMerchantHeaders: jest.fn().mockReturnValue('web'),
    }
    const provider = new PlategaRecurrentProvider(transport as any)

    beforeEach(() => jest.clearAllMocks())

    it('creates an SBP mandate through the non-v2 process endpoint with only documented fields', async () => {
        transport.requestApi.mockResolvedValue({
            transactionId: 'subscription-1',
            redirect: 'https://pay.example/subscription-1',
            status: 'PendingAgreement',
            merchantId: 'merchant-web',
        })

        const result = await provider.createSubscription({
            merchantProfile: 'web',
            amount: 500,
            currency: 'RUB',
            interval: 3,
            intervalCount: 1,
            description: 'NOS VPN recurrent plan',
        })

        expect(transport.requestApi).toHaveBeenCalledWith(
            '/transaction/process',
            {
                method: 'POST',
                body: JSON.stringify({
                    paymentMethod: 6,
                    paymentDetails: { amount: 500, currency: 'RUB', interval: 3, intervalCount: 1 },
                    description: 'NOS VPN recurrent plan',
                }),
            },
            'web',
        )
        expect(result).toMatchObject({ providerSubscriptionId: 'subscription-1', status: 'PendingAgreement' })
    })

    it('gets and cancels a mandate through the documented subscription routes', async () => {
        transport.requestApi
            .mockResolvedValueOnce({ status: 'Active', intervalUnit: 'Month', intervalCount: 1 })
            .mockResolvedValueOnce({ subscriptionId: 'subscription-1', status: 'cancelled' })

        await provider.getSubscription('subscription-1', 'bot')
        await provider.cancelSubscription('subscription-1', 'bot')

        expect(transport.requestApi).toHaveBeenNthCalledWith(
            1,
            '/subscription/subscription-1',
            { method: 'GET' },
            'bot',
        )
        expect(transport.requestApi).toHaveBeenNthCalledWith(
            2,
            '/subscription/subscription-1/cancel',
            { method: 'POST' },
            'bot',
        )
    })

    it('delegates callback credentials to the constant-time merchant verifier', () => {
        expect(provider.verifyCallback({ 'x-merchantid': 'merchant-web', 'x-secret': 'secret' })).toBe('web')
        expect(transport.verifyMerchantHeaders).toHaveBeenCalled()
    })
})
