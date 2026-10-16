import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentProviderError } from '../errors/payment-provider.error'

@Injectable()
export class PaymentProviderPolicyService {
    constructor(private readonly configService: ConfigService) {}

    getPrimaryProvider(userId?: string): PaymentProvider {
        const value = String(this.configService.get<string>('PAYMENT_PRIMARY_PROVIDER') || PaymentProvider.PLATEGA)
            .trim()
            .toUpperCase()
        const canaryUsers = String(this.configService.get<string>('PAYMENT_YOOKASSA_CANARY_USER_IDS') || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        if (value === PaymentProvider.PLATEGA && userId && canaryUsers.includes(userId) && this.isYooKassaEnabled()) {
            return PaymentProvider.YOOKASSA
        }
        if (value === PaymentProvider.PLATEGA) return PaymentProvider.PLATEGA
        if (value === PaymentProvider.YOOKASSA) return PaymentProvider.YOOKASSA
        throw new PaymentProviderError({
            message: 'PAYMENT_PRIMARY_PROVIDER is invalid',
            provider: PaymentProvider.PLATEGA,
            kind: 'CONFIGURATION',
        })
    }

    isYooKassaEnabled(): boolean {
        return this.configService.get<string>('PAYMENT_YOOKASSA_ENABLED') === 'true'
    }

    isCheckoutProviderAvailable(provider: PaymentProvider): boolean {
        return provider === PaymentProvider.PLATEGA || this.isYooKassaEnabled()
    }

    assertProviderAvailable(provider: PaymentProvider): void {
        if (provider === PaymentProvider.PLATEGA) return
        if (!this.isCheckoutProviderAvailable(provider)) {
            throw new PaymentProviderError({
                message: 'YooKassa payment provider is disabled',
                provider: PaymentProvider.YOOKASSA,
                kind: 'CONFIGURATION',
            })
        }
    }
}
