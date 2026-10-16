import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { Payment } from '../entity/payment.entity'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { resolvePaymentMerchant } from '../providers/payment-merchant-resolver'
import { PaymentProviderPolicyService } from '../providers/payment-provider-policy.service'
import { PlategaMerchantProfile } from '../providers/platega-payment.provider'

@Injectable()
export class PaymentProviderRoutingService {
    constructor(
        private readonly configService: ConfigService,
        private readonly paymentProviderPolicy: PaymentProviderPolicyService,
    ) {}

    getPrimaryProvider(userId?: string) {
        return this.paymentProviderPolicy.getPrimaryProvider(userId)
    }

    resolveCheckoutProvider(mode: PaymentCheckoutMode, userId?: string): PaymentProvider {
        if (mode === PaymentCheckoutMode.ONE_TIME) return this.getPrimaryProvider(userId)
        if (mode === PaymentCheckoutMode.PLATEGA_CRYPTO) return PaymentProvider.PLATEGA
        throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Unsupported checkout mode')
    }

    isCheckoutModeAvailable(mode: PaymentCheckoutMode, userId?: string): boolean {
        return this.paymentProviderPolicy.isCheckoutProviderAvailable(this.resolveCheckoutProvider(mode, userId))
    }

    assertProviderAvailable(provider: PaymentProvider) {
        return this.paymentProviderPolicy.assertProviderAvailable(provider)
    }

    resolveMerchant(profile: PlategaMerchantProfile) {
        return resolvePaymentMerchant(profile)
    }

    buildPaymentReturnUrl(kind: 'success' | 'fail', paymentId: string, merchantProfile: PlategaMerchantProfile) {
        const successKey = merchantProfile === 'web' ? 'PAYMENT_WEB_RETURN_URL' : 'PAYMENT_RETURN_URL'
        const failKey = merchantProfile === 'web' ? 'PAYMENT_WEB_FAIL_RETURN_URL' : 'PAYMENT_FAIL_RETURN_URL'
        const successBase = String(this.configService.get<string>(successKey) || '').trim()
        const failBase = String(this.configService.get<string>(failKey) || '').trim()
        const base = kind === 'fail' ? failBase || successBase : successBase
        if (!base) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, `${successKey} is not configured`)
        }

        const encodedPaymentId = encodeURIComponent(paymentId)
        if (base.includes('{paymentId}')) {
            return base.replace('{paymentId}', encodedPaymentId)
        }

        return `${base}${encodedPaymentId}`
    }

    resolvePaymentMerchantProfile(payment: Payment): PlategaMerchantProfile {
        const profile = payment.metadataSnapshot?.payment_profile || payment.metadataSnapshot?.paymentProfile
        return profile === 'web' ? 'web' : 'bot'
    }
}
