import { HttpException } from '@nestjs/common'

import { mapBotCheckoutError } from './bot-checkout-error.mapper'
import { PaymentProvider } from '../../payment/enum/payment-provider.enum'
import { PaymentProviderError } from '../../payment/errors/payment-provider.error'
import { PromoValidationError, PromoValidationErrorCode } from '../../promo/errors/promo-validation.error'

describe('mapBotCheckoutError', () => {
    it.each([
        ['PROMO_NOT_FOUND', 'Промокод недействителен или срок его действия закончился.'],
        ['PROMO_INACTIVE', 'Промокод недействителен или срок его действия закончился.'],
        ['PROMO_NOT_STARTED', 'Промокод недействителен или срок его действия закончился.'],
        ['PROMO_EXPIRED', 'Промокод недействителен или срок его действия закончился.'],
        ['PROMO_LIMIT_REACHED', 'Лимит использований этого промокода исчерпан.'],
        ['PROMO_ALREADY_USED', 'Вы уже использовали этот промокод.'],
        ['PROMO_RESERVATION_CONFLICT', 'Для этого промокода уже есть незавершённая попытка оплаты. Попробуйте позже.'],
    ] as Array<[PromoValidationErrorCode, string]>)('maps %s', (code, userMessage) => {
        expect(mapBotCheckoutError(new PromoValidationError(code))).toEqual({ safeCode: code, userMessage })
    })

    it('maps terminal provider rejection without exposing its message', () => {
        const error = new PaymentProviderError({
            message: 'raw-provider-secret',
            provider: PaymentProvider.YOOKASSA,
            kind: 'TERMINAL_REQUEST',
        })

        expect(mapBotCheckoutError(error)).toEqual({
            safeCode: 'PAYMENT_PROVIDER_REJECTED',
            userMessage: 'Платёжный сервис отклонил создание платежа. Оплата не была списана.',
        })
    })

    it.each([
        new HttpException({ message: 'AUTH_FAIL' }, 401),
        new HttpException({ message: 'unknown' }, 503),
        new Error('network raw secret'),
    ])('maps auth, 5xx and unknown failures to a temporary error', (error) => {
        expect(mapBotCheckoutError(error)).toEqual({
            safeCode: 'CHECKOUT_TEMPORARY_ERROR',
            userMessage: 'Не удалось подготовить оплату из-за временной технической ошибки. Попробуйте позже.',
        })
    })
})
