import { HttpException } from '@nestjs/common'

import { PaymentProviderError } from '../../payment/errors/payment-provider.error'
import { PromoValidationError } from '../../promo/errors/promo-validation.error'

export type BotCheckoutErrorMapping = {
    userMessage: string
    safeCode: string
}

const INVALID_PROMO_MESSAGE = 'Промокод недействителен или срок его действия закончился.'
const TEMPORARY_ERROR_MESSAGE = 'Не удалось подготовить оплату из-за временной технической ошибки. Попробуйте позже.'

export function mapBotCheckoutError(error: unknown): BotCheckoutErrorMapping {
    if (error instanceof PromoValidationError) {
        switch (error.code) {
            case 'PROMO_NOT_FOUND':
            case 'PROMO_INACTIVE':
            case 'PROMO_NOT_STARTED':
            case 'PROMO_EXPIRED':
                return { safeCode: error.code, userMessage: INVALID_PROMO_MESSAGE }
            case 'PROMO_LIMIT_REACHED':
                return {
                    safeCode: error.code,
                    userMessage: 'Лимит использований этого промокода исчерпан.',
                }
            case 'PROMO_ALREADY_USED':
                return { safeCode: error.code, userMessage: 'Вы уже использовали этот промокод.' }
            case 'PROMO_RESERVATION_CONFLICT':
                return {
                    safeCode: error.code,
                    userMessage: 'Для этого промокода уже есть незавершённая попытка оплаты. Попробуйте позже.',
                }
        }
    }

    if (error instanceof PaymentProviderError && error.kind === 'TERMINAL_REQUEST') {
        return {
            safeCode: 'PAYMENT_PROVIDER_REJECTED',
            userMessage: 'Платёжный сервис отклонил создание платежа. Оплата не была списана.',
        }
    }

    if (error instanceof HttpException) {
        const response = error.getResponse()
        const code =
            typeof response === 'object' && response !== null
                ? String((response as Record<string, unknown>).message || '')
                : ''
        if (code === 'PAYMENT_PROVIDER_REJECTED') {
            return {
                safeCode: 'PAYMENT_PROVIDER_REJECTED',
                userMessage: 'Платёжный сервис отклонил создание платежа. Оплата не была списана.',
            }
        }
    }

    return { safeCode: 'CHECKOUT_TEMPORARY_ERROR', userMessage: TEMPORARY_ERROR_MESSAGE }
}
