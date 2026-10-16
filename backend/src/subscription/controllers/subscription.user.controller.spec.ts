import { UnprocessableEntityException } from '@nestjs/common'

import { SubscriptionUserController } from './subscription.user.controller'
import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { PaymentProvider } from '../../payment/enum/payment-provider.enum'
import { PaymentProviderError } from '../../payment/errors/payment-provider.error'

describe('SubscriptionUserController payment provider errors', () => {
    const user = { id: 'user-1' } as any
    const action = { action: 'payment.create', planId: 'plan-1' } as any

    function createController(error: unknown) {
        return new SubscriptionUserController(
            {
                performAction: jest.fn().mockRejectedValue(error),
            } as any,
            {} as any,
        )
    }

    it('maps a terminal provider rejection to a stable safe 422 response', async () => {
        const secret = 'provider-secret-body'
        const providerError = new PaymentProviderError({
            message: secret,
            provider: PaymentProvider.YOOKASSA,
            merchant: PaymentMerchant.SITE,
            kind: 'TERMINAL_REQUEST',
            statusCode: 400,
            providerDescription: secret,
        })

        let thrown: unknown
        try {
            await createController(providerError).subscriptionAction(user, action)
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(UnprocessableEntityException)
        const response = (thrown as UnprocessableEntityException).getResponse() as Record<string, unknown>
        expect(response).toEqual({
            statusCode: 422,
            message: 'PAYMENT_PROVIDER_REJECTED',
            description: 'Платёжный провайдер отклонил создание платежа. Оплата не была списана.',
            correlationId: expect.stringMatching(/^pay_[0-9a-f]{16}$/),
        })
        expect(JSON.stringify(response)).not.toContain(secret)
    })

    it.each(['OUTCOME_UNKNOWN', 'CONFIGURATION'] as const)(
        'does not misrepresent a %s error as a terminal rejection',
        async (kind) => {
            const providerError = new PaymentProviderError({
                message: 'safe internal error',
                provider: PaymentProvider.YOOKASSA,
                kind,
            })

            await expect(createController(providerError).subscriptionAction(user, action)).rejects.toBe(providerError)
        },
    )
})
