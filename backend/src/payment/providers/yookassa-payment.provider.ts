import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import {
    CreateExternalPaymentInput,
    CreateRecurrentPaymentInput,
    CreatedExternalPayment,
    ExternalPaymentProvider,
    GetExternalPaymentInput,
} from './payment-provider.contract'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentProviderError, SafePaymentProviderErrorFields } from '../errors/payment-provider.error'
import { PaymentMethodConsentSource } from '../types/payment-method-consent-source'
import {
    YooKassaCreatePaymentRequest,
    YooKassaCreateRecurrentPaymentRequest,
    YooKassaPaymentResponse,
} from '../types/yookassa-payment.types'

const DEFAULT_API_BASE_URL = 'https://api.yookassa.ru/v3'
const DEFAULT_TIMEOUT_MS = 15000
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROVIDER_CODE_MAX_LENGTH = 64
const PROVIDER_TYPE_MAX_LENGTH = 64
const PROVIDER_DESCRIPTION_MAX_LENGTH = 256
const PROVIDER_PARAMETER_MAX_LENGTH = 64
const PROVIDER_REQUEST_ID_MAX_LENGTH = 128

@Injectable()
export class YooKassaPaymentProvider implements ExternalPaymentProvider {
    readonly provider = PaymentProvider.YOOKASSA

    constructor(private readonly configService: ConfigService) {}

    isMerchantConfigured(merchant: PaymentMerchant): boolean {
        const { shopKey, secretKey } = this.getCredentialKeys(merchant)
        return Boolean(
            String(this.configService.get<string>(shopKey) || '').trim() &&
                String(this.configService.get<string>(secretKey) || '').trim(),
        )
    }

    async createPayment(input: CreateExternalPaymentInput): Promise<CreatedExternalPayment> {
        const idempotencyKey = this.requireIdempotencyKey(input.idempotencyKey, input.merchant)
        const credentials = this.getCredentials(input.merchant)
        const amount = this.formatRubAmount(input.amountRub, input.merchant)
        const returnUrl = String(input.returnUrl || '').trim()
        if (!returnUrl) {
            throw this.configurationError(input.merchant, 'YooKassa payment input is incomplete')
        }

        const body: YooKassaCreatePaymentRequest = {
            amount: { value: amount, currency: 'RUB' },
            capture: true,
            confirmation: { type: 'redirect', return_url: returnUrl },
            ...(this.shouldRequestPaymentMethodSaving(input.paymentMethodConsentSource)
                ? { save_payment_method: true as const }
                : {}),
            description: this.sanitizeDescription(input.description),
            metadata: {
                local_payment_id: input.localPaymentId,
                ...(input.subscriptionId ? { subscription_id: input.subscriptionId } : {}),
                ...(input.planId ? { plan_id: input.planId } : {}),
                merchant: input.merchant,
            },
            ...(input.receipt ? { receipt: input.receipt } : {}),
        }

        const timeoutMs = this.getTimeoutMs(input.merchant)
        const requestUrl = `${this.getBaseUrl(input.merchant)}/payments`
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)
        let response: Response
        try {
            const token = Buffer.from(`${credentials.shopId}:${credentials.secretKey}`, 'utf8').toString('base64')
            response = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${token}`,
                    'Idempotence-Key': idempotencyKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            })
        } catch (cause) {
            clearTimeout(timeout)
            throw new PaymentProviderError({
                message: 'YooKassa payment creation outcome is unknown',
                provider: this.provider,
                merchant: input.merchant,
                kind: 'OUTCOME_UNKNOWN',
                cause,
            })
        }

        let text: string
        try {
            text = await response.text()
        } catch (cause) {
            throw new PaymentProviderError({
                message: 'YooKassa response could not be confirmed',
                provider: this.provider,
                merchant: input.merchant,
                kind: 'OUTCOME_UNKNOWN',
                statusCode: response.status,
                cause,
            })
        } finally {
            clearTimeout(timeout)
        }
        let parsed: Record<string, unknown> | null = null
        if (text && this.isJsonResponse(response)) {
            try {
                parsed = this.asRecord(JSON.parse(text))
            } catch {
                if (response.ok) {
                    throw new PaymentProviderError({
                        message: 'YooKassa response could not be confirmed',
                        provider: this.provider,
                        merchant: input.merchant,
                        kind: 'OUTCOME_UNKNOWN',
                        statusCode: response.status,
                    })
                }
            }
        }

        if (!response.ok) {
            const terminal = response.status >= 400 && response.status <= 499
            throw new PaymentProviderError({
                message: terminal
                    ? 'YooKassa rejected the payment creation request'
                    : 'YooKassa payment creation outcome is unknown',
                provider: this.provider,
                merchant: input.merchant,
                kind: terminal ? 'TERMINAL_REQUEST' : 'OUTCOME_UNKNOWN',
                statusCode: response.status,
                ...this.getSafeProviderErrorFields(response, parsed),
            })
        }

        const payment = parsed as YooKassaPaymentResponse | null
        if (
            !payment ||
            typeof payment.id !== 'string' ||
            !payment.id ||
            typeof payment.status !== 'string' ||
            !payment.status
        ) {
            throw new PaymentProviderError({
                message: 'YooKassa response is missing required payment fields',
                provider: this.provider,
                merchant: input.merchant,
                kind: 'OUTCOME_UNKNOWN',
                statusCode: response.status,
            })
        }

        return this.toCreatedPayment(payment, input.merchant)
    }

    async getPayment(input: GetExternalPaymentInput): Promise<CreatedExternalPayment> {
        const providerPaymentId = String(input.providerPaymentId || '').trim()
        if (!providerPaymentId) throw this.configurationError(input.merchant, 'Provider payment id is required')
        return this.requestCanonical(input.merchant, `/payments/${encodeURIComponent(providerPaymentId)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        })
    }

    async createRecurrentPayment(input: CreateRecurrentPaymentInput): Promise<CreatedExternalPayment> {
        const idempotencyKey = this.requireIdempotencyKey(input.idempotencyKey, input.merchant)
        const methodId = String(input.providerPaymentMethodId || '').trim()
        if (!methodId) {
            throw this.configurationError(input.merchant, 'Recurrent payment input is invalid')
        }
        const body: YooKassaCreateRecurrentPaymentRequest = {
            amount: { value: this.formatRubAmount(input.amountRub, input.merchant), currency: 'RUB' },
            capture: true,
            payment_method_id: methodId,
            description: this.sanitizeDescription(input.description),
            metadata: {
                local_payment_id: input.localPaymentId,
                renewal_id: input.renewalId,
                subscription_id: input.subscriptionId,
                plan_id: input.planId,
                merchant: input.merchant,
                recurrent: 'true',
            },
            ...(input.receipt ? { receipt: input.receipt } : {}),
        }
        return this.requestCanonical(input.merchant, '/payments', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Idempotence-Key': idempotencyKey,
            },
            body: JSON.stringify(body),
        })
    }

    private async requestCanonical(
        merchant: PaymentMerchant,
        path: string,
        init: RequestInit,
    ): Promise<CreatedExternalPayment> {
        const credentials = this.getCredentials(merchant)
        const token = Buffer.from(`${credentials.shopId}:${credentials.secretKey}`, 'utf8').toString('base64')
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs(merchant))
        let response: Response
        try {
            response = await fetch(`${this.getBaseUrl(merchant)}${path}`, {
                ...init,
                headers: { ...init.headers, Authorization: `Basic ${token}` },
                signal: controller.signal,
            })
            const text = await response.text()
            let parsed: Record<string, unknown> | null = null
            if (text && this.isJsonResponse(response)) {
                try {
                    parsed = this.asRecord(JSON.parse(text))
                } catch {
                    if (response.ok) {
                        throw new PaymentProviderError({
                            message: 'YooKassa payment response could not be confirmed',
                            provider: this.provider,
                            merchant,
                            kind: 'OUTCOME_UNKNOWN',
                            statusCode: response.status,
                        })
                    }
                }
            }
            if (!response.ok) {
                throw new PaymentProviderError({
                    message:
                        response.status >= 400 && response.status < 500
                            ? 'YooKassa rejected the payment request'
                            : 'YooKassa payment outcome is unknown',
                    provider: this.provider,
                    merchant,
                    kind: response.status >= 400 && response.status < 500 ? 'TERMINAL_REQUEST' : 'OUTCOME_UNKNOWN',
                    statusCode: response.status,
                    ...this.getSafeProviderErrorFields(response, parsed),
                })
            }
            const payment = parsed as YooKassaPaymentResponse | null
            if (!payment?.id || !payment.status) throw new Error('missing payment fields')
            return this.toCreatedPayment(payment, merchant)
        } catch (cause) {
            if (cause instanceof PaymentProviderError) throw cause
            throw new PaymentProviderError({
                message: 'YooKassa payment outcome is unknown',
                provider: this.provider,
                merchant,
                kind: 'OUTCOME_UNKNOWN',
                cause,
            })
        } finally {
            clearTimeout(timeout)
        }
    }

    private toCreatedPayment(payment: YooKassaPaymentResponse, merchant: PaymentMerchant): CreatedExternalPayment {
        return {
            provider: this.provider,
            merchant,
            providerPaymentId: payment.id,
            status: this.mapStatus(payment.status),
            externalStatus: payment.status,
            confirmationUrl:
                typeof payment.confirmation?.confirmation_url === 'string'
                    ? payment.confirmation.confirmation_url
                    : null,
            providerInvoiceId: null,
            amountValue: payment.amount?.value ?? null,
            currency: payment.amount?.currency ?? null,
            incomeAmountValue: payment.income_amount?.value ?? null,
            incomeAmountCurrency: payment.income_amount?.currency ?? null,
            metadata: payment.metadata || {},
            createdAt: payment.created_at ?? null,
            capturedAt: payment.captured_at ?? null,
            cancellationReason: payment.cancellation_details?.reason ?? null,
            paymentMethod: payment.payment_method
                ? {
                      id: typeof payment.payment_method.id === 'string' ? payment.payment_method.id : null,
                      saved: payment.payment_method.saved === true,
                      type: typeof payment.payment_method.type === 'string' ? payment.payment_method.type : null,
                      ...(typeof payment.payment_method.title === 'string'
                          ? { title: payment.payment_method.title }
                          : {}),
                      ...(typeof payment.payment_method.card?.last4 === 'string'
                          ? { last4: payment.payment_method.card.last4 }
                          : {}),
                  }
                : null,
            safeResponseSnapshot: this.safeResponseSnapshot(payment),
        }
    }

    private getCredentials(merchant: PaymentMerchant): { shopId: string; secretKey: string } {
        const { shopKey, secretKey } = this.getCredentialKeys(merchant)
        const shopId = String(this.configService.get<string>(shopKey) || '').trim()
        const secret = String(this.configService.get<string>(secretKey) || '').trim()
        if (!shopId || !secret) {
            throw this.configurationError(merchant, 'YooKassa credentials are not configured')
        }
        return { shopId, secretKey: secret }
    }

    private getCredentialKeys(merchant: PaymentMerchant) {
        return merchant === PaymentMerchant.SITE
            ? { shopKey: 'YOOKASSA_SITE_SHOP_ID', secretKey: 'YOOKASSA_SITE_SECRET_KEY' }
            : { shopKey: 'YOOKASSA_BOT_SHOP_ID', secretKey: 'YOOKASSA_BOT_SECRET_KEY' }
    }

    private formatRubAmount(amount: number, merchant: PaymentMerchant): string {
        const kopecks = amount * 100
        if (
            !Number.isFinite(amount) ||
            amount <= 0 ||
            Math.abs(kopecks - Math.round(kopecks)) > Number.EPSILON * Math.max(1, Math.abs(kopecks)) * 4
        ) {
            throw this.configurationError(merchant, 'YooKassa payment amount is invalid')
        }
        return amount.toFixed(2)
    }

    private sanitizeDescription(description: string): string {
        const clean = String(description || '')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
        return Array.from(clean || 'Оплата подписки NOS VPN')
            .slice(0, 128)
            .join('')
    }

    private getBaseUrl(merchant: PaymentMerchant): string {
        const raw = String(this.configService.get<string>('YOOKASSA_API_BASE_URL') || DEFAULT_API_BASE_URL)
            .trim()
            .replace(/\/+$/, '')
        try {
            const url = new URL(raw)
            if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol')
        } catch (cause) {
            throw new PaymentProviderError({
                message: 'YooKassa API base URL is invalid',
                provider: this.provider,
                merchant,
                kind: 'CONFIGURATION',
                cause,
            })
        }
        return raw
    }

    private getTimeoutMs(merchant: PaymentMerchant): number {
        const raw = this.configService.get<string>('YOOKASSA_HTTP_TIMEOUT_MS')
        const timeout = raw === undefined || raw === null || raw === '' ? DEFAULT_TIMEOUT_MS : Number(raw)
        if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60000) {
            throw this.configurationError(merchant, 'YooKassa HTTP timeout is invalid')
        }
        return timeout
    }

    private mapStatus(status: string): PaymentStatusEnum {
        if (status === 'succeeded') return PaymentStatusEnum.SUCCEEDED
        if (status === 'canceled') return PaymentStatusEnum.CANCELED
        return PaymentStatusEnum.PENDING
    }

    private safeResponseSnapshot(payment: YooKassaPaymentResponse): Record<string, unknown> {
        return {
            id: payment.id,
            status: payment.status,
            paid: payment.paid === true,
            amount: {
                value: payment.amount?.value ?? null,
                currency: payment.amount?.currency ?? null,
            },
            ...(payment.income_amount
                ? {
                      incomeAmount: {
                          value: payment.income_amount.value ?? null,
                          currency: payment.income_amount.currency ?? null,
                      },
                  }
                : {}),
            confirmation: {
                type: payment.confirmation?.type ?? null,
                hasUrl: Boolean(payment.confirmation?.confirmation_url),
            },
            paymentMethod: {
                saved: payment.payment_method?.saved === true,
                type: payment.payment_method?.type ?? null,
                hasId: Boolean(payment.payment_method?.id),
                ...(payment.payment_method?.title ? { title: payment.payment_method.title } : {}),
                ...(payment.payment_method?.card?.last4 ? { last4: payment.payment_method.card.last4 } : {}),
            },
            ...(payment.cancellation_details
                ? {
                      cancellation: {
                          party: payment.cancellation_details.party ?? null,
                          reason: payment.cancellation_details.reason ?? null,
                      },
                  }
                : {}),
            createdAt: payment.created_at ?? null,
            capturedAt: payment.captured_at ?? null,
            expiresAt: payment.expires_at ?? null,
            test: payment.test === true,
        }
    }

    private requireIdempotencyKey(value: string, merchant: PaymentMerchant): string {
        const key = typeof value === 'string' ? value : ''
        if (!key || key.length > 64 || !UUID_V4_PATTERN.test(key)) {
            throw new PaymentProviderError({
                message: 'YooKassa idempotency key is invalid',
                provider: this.provider,
                merchant,
                kind: 'CONFIGURATION',
                providerCode: 'INVALID_PROVIDER_IDEMPOTENCE_KEY',
            })
        }
        return key
    }

    private shouldRequestPaymentMethodSaving(consentSource: PaymentMethodConsentSource): boolean {
        return consentSource === PaymentMethodConsentSource.MERCHANT_EXPLICIT
    }

    private isJsonResponse(response: Response): boolean {
        const contentType = String(response.headers?.get('content-type') || '')
            .split(';', 1)[0]
            .trim()
            .toLowerCase()
        return contentType === 'application/json' || contentType.endsWith('+json')
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null
    }

    private getSafeProviderErrorFields(
        response: Response,
        body: Record<string, unknown> | null,
    ): SafePaymentProviderErrorFields {
        return {
            providerCode: this.safeProviderString(body?.code, PROVIDER_CODE_MAX_LENGTH),
            providerType: this.safeProviderString(body?.type, PROVIDER_TYPE_MAX_LENGTH),
            providerDescription: this.safeProviderString(body?.description, PROVIDER_DESCRIPTION_MAX_LENGTH),
            providerParameter: this.safeProviderString(body?.parameter, PROVIDER_PARAMETER_MAX_LENGTH),
            providerRequestIdMasked: this.getMaskedProviderRequestId(response, body),
        }
    }

    private safeProviderString(value: unknown, maxLength: number): string | undefined {
        if (typeof value !== 'string') return undefined
        const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()
        if (!sanitized) return undefined
        const redacted = this.redactProviderSensitiveText(sanitized)
        return Array.from(redacted).slice(0, maxLength).join('')
    }

    private redactProviderSensitiveText(value: string): string {
        let redacted = value
        for (const key of [
            'YOOKASSA_SITE_SHOP_ID',
            'YOOKASSA_SITE_SECRET_KEY',
            'YOOKASSA_BOT_SHOP_ID',
            'YOOKASSA_BOT_SECRET_KEY',
        ]) {
            const secret = String(this.configService.get<string>(key) || '').trim()
            if (secret) redacted = redacted.split(secret).join('[redacted]')
        }
        return redacted
            .replace(/\b(Basic|Bearer)\s+[^\s,;]+/gi, '$1 [redacted]')
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
            .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-uuid]')
            .replace(/\b(?:\d[ -]?){13,19}\b/g, '[redacted-number]')
    }

    private getMaskedProviderRequestId(response: Response, body: Record<string, unknown> | null): string | undefined {
        const raw =
            response.headers?.get('x-request-id') || response.headers?.get('request-id') || body?.request_id || body?.id
        const requestId = this.safeProviderString(raw, PROVIDER_REQUEST_ID_MAX_LENGTH)
        if (!requestId) return undefined
        const suffix = Array.from(requestId).slice(-4).join('')
        return suffix ? `***${suffix}` : '[masked]'
    }

    private configurationError(merchant: PaymentMerchant, message: string): PaymentProviderError {
        return new PaymentProviderError({
            message,
            provider: this.provider,
            merchant,
            kind: 'CONFIGURATION',
        })
    }
}
