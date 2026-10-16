import { timingSafeEqual } from 'crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'


export const PLATEGA_PROVIDER = 'platega'
export type PlategaMerchantProfile = 'bot' | 'web'

export interface CreatePlategaPaymentInput {
    amount: number
    currency: string
    description: string
    returnUrl: string
    failedUrl: string
    metadata: Record<string, any>
    idempotencyKey: string
    merchantProfile?: PlategaMerchantProfile
    checkoutMode?: PaymentCheckoutMode
}

export interface CreatePlategaPaymentResult {
    providerPaymentId: string
    providerInvoiceId?: string | null
    paymentUrl: string
    raw: Record<string, any>
}

export interface ParsedPlategaPayment {
    provider: typeof PLATEGA_PROVIDER
    providerEventId: string
    providerPaymentId: string
    eventType: string
    status: PaymentStatusEnum
    rawStatus?: string
    amount?: number
    currency?: string
    metadata: Record<string, any>
    paymentUrl?: string | null
}

@Injectable()
export class PlategaPaymentProvider {
    constructor(private readonly configService: ConfigService) {}

    getProviderName() {
        return PLATEGA_PROVIDER
    }

    isMerchantConfigured(profile: PlategaMerchantProfile): boolean {
        const merchantKey = profile === 'web' ? 'PLATEGA_WEB_MERCHANT_ID' : 'PLATEGA_MERCHANT_ID'
        const secretKey = profile === 'web' ? 'PLATEGA_WEB_SECRET' : 'PLATEGA_SECRET'
        return Boolean(
            String(this.configService.get<string>(merchantKey) || '').trim() &&
                String(this.configService.get<string>(secretKey) || '').trim(),
        )
    }

    async createPayment(input: CreatePlategaPaymentInput): Promise<CreatePlategaPaymentResult> {
        const isCrypto = input.checkoutMode === PaymentCheckoutMode.PLATEGA_CRYPTO
        const body: Record<string, any> = {
            paymentDetails: {
                amount: Number(input.amount),
                currency: input.currency || 'RUB',
            },
            description: input.description,
            return: input.returnUrl,
            failedUrl: input.failedUrl,
            payload: JSON.stringify({
                localPaymentId: input.metadata.local_payment_id,
                subscriptionId: input.metadata.subscription_id,
                planId: input.metadata.plan_id,
                userId: input.metadata.user_id,
                promoCode: input.metadata.promo_code || '',
                paymentProfile: input.metadata.payment_profile || input.merchantProfile || 'bot',
                idempotencyKey: input.idempotencyKey,
            }),
        }
        if (isCrypto) body.paymentMethod = 13

        const response = await this.requestApi(
            isCrypto ? '/transaction/process' : '/v2/transaction/process',
            {
                method: 'POST',
                body: JSON.stringify(body),
            },
            input.merchantProfile || 'bot',
        )

        const providerPaymentId = response?.transactionId || response?.id
        const paymentUrl = response?.url || response?.redirect || response?.payformUrl || response?.payformSuccessUrl
        if (!providerPaymentId || !paymentUrl) {
            throw new ErrorDto(
                ErrorCodeEnum.ENTITY_CREATION_FAIL,
                'Platega did not return transactionId or payment URL',
            )
        }
        if (isCrypto) this.assertCryptoPaymentUrl(String(paymentUrl))

        return {
            providerPaymentId: String(providerPaymentId),
            providerInvoiceId: null,
            paymentUrl: String(paymentUrl),
            raw: this.safeResponseSnapshot(response),
        }
    }

    verifyWebhook(payload: any, headers: Record<string, any>, _rawBody?: Buffer | string) {
        this.assertWebhookShape(payload)
        this.verifyMerchantHeaders(headers)
        return true
    }

    verifyMerchantHeaders(headers: Record<string, any>): PlategaMerchantProfile {
        const actualMerchantId = this.getHeader(headers, 'x-merchantid')
        const actualSecret = this.getHeader(headers, 'x-secret')
        const profile = this.resolveMerchantProfileByMerchantId(actualMerchantId)
        const expectedMerchantId = this.getMerchantId(profile)
        const expectedSecret = this.getSecret(profile)

        if (!actualMerchantId || actualMerchantId !== expectedMerchantId) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Platega merchant id is invalid')
        }

        if (!actualSecret || !this.safeEqual(actualSecret, expectedSecret)) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Platega secret is invalid')
        }

        return profile
    }

    parseWebhook(payload: any): ParsedPlategaPayment {
        return this.parsePaymentLikePayload(payload, 'paymentStatus')
    }

    mapProviderStatusToLocalStatus(providerStatus: string) {
        const status = String(providerStatus || '').toUpperCase()
        if (status === 'CONFIRMED') {
            return PaymentStatusEnum.SUCCEEDED
        }
        if (status === 'CANCELED') {
            return PaymentStatusEnum.CANCELED
        }
        if (status === 'CHARGEBACKED') {
            return PaymentStatusEnum.REFUNDED
        }
        if (status === 'PENDING') {
            return PaymentStatusEnum.PENDING
        }

        return PaymentStatusEnum.PENDING
    }

    async getPaymentStatus(
        providerPaymentId: string,
        merchantProfile: PlategaMerchantProfile = 'bot',
    ): Promise<ParsedPlategaPayment> {
        const response = await this.requestApi(
            `/transaction/${encodeURIComponent(providerPaymentId)}`,
            {
                method: 'GET',
            },
            merchantProfile,
        )

        return this.parsePaymentLikePayload({ ...response, id: response?.id || providerPaymentId }, 'statusCheck')
    }

    private parsePaymentLikePayload(payload: any, eventType: string): ParsedPlategaPayment {
        const providerStatus = String(payload?.status || 'UNKNOWN')
        const providerPaymentId = String(payload?.id || payload?.transactionId || '')
        if (!providerPaymentId) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Platega payload missing payment id')
        }

        const paymentDetails = payload?.paymentDetails || {}
        return {
            provider: PLATEGA_PROVIDER,
            providerEventId: `${providerPaymentId}:${providerStatus}`,
            providerPaymentId,
            eventType,
            status: this.mapProviderStatusToLocalStatus(providerStatus),
            rawStatus: providerStatus,
            amount: Number(payload?.amount || paymentDetails?.amount || 0) || undefined,
            currency: payload?.currency || paymentDetails?.currency || 'RUB',
            metadata: this.parsePayload(payload?.payload),
            paymentUrl: payload?.payformSuccessUrl || payload?.url || payload?.redirect || null,
        }
    }

    async requestApi(path: string, init: RequestInit, merchantProfile: PlategaMerchantProfile) {
        const url = `${this.getBaseUrl()}${path.replace(/^\//, '')}`
        const response = await fetch(url, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                'X-MerchantId': this.getMerchantId(merchantProfile),
                'X-Secret': this.getSecret(merchantProfile),
                ...(init.headers || {}),
            },
        })
        const text = await response.text()
        const body = text ? this.parseJson(text) : {}
        if (!response.ok) {
            throw new ErrorDto(
                ErrorCodeEnum.ENTITY_CREATION_FAIL,
                `Platega request failed with status ${response.status}`,
            )
        }

        return body
    }

    private getBaseUrl() {
        return String(this.configService.get<string>('PLATEGA_BASE_URL') || 'https://app.platega.io/').replace(
            /\/?$/,
            '/',
        )
    }

    private assertCryptoPaymentUrl(value: string) {
        let url: URL
        try {
            url = new URL(value)
        } catch {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Platega returned an invalid crypto payment URL')
        }
        const allowedHosts = [
            ...new Set(
                String(this.configService.get<string>('PLATEGA_PAYMENT_URL_ALLOWED_HOSTS') || 'pay.platega.io')
                    .split(',')
                    .map((host) => host.trim().toLowerCase())
                    .filter(Boolean),
            ),
        ]
        if (
            url.protocol !== 'https:' ||
            Boolean(url.username || url.password) ||
            !allowedHosts.includes(url.hostname.toLowerCase())
        ) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Platega returned an untrusted crypto payment URL')
        }
    }

    private getMerchantId(profile: PlategaMerchantProfile) {
        const key = profile === 'web' ? 'PLATEGA_WEB_MERCHANT_ID' : 'PLATEGA_MERCHANT_ID'
        const value = String(this.configService.get<string>(key) || '').trim()
        if (!value) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, `${key} is not configured`)
        }
        return value
    }

    private getSecret(profile: PlategaMerchantProfile) {
        const key = profile === 'web' ? 'PLATEGA_WEB_SECRET' : 'PLATEGA_SECRET'
        const value = String(this.configService.get<string>(key) || '').trim()
        if (!value) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, `${key} is not configured`)
        }
        return value
    }

    private resolveMerchantProfileByMerchantId(merchantId: string): PlategaMerchantProfile {
        const webMerchantId = String(this.configService.get<string>('PLATEGA_WEB_MERCHANT_ID') || '').trim()
        if (webMerchantId && merchantId === webMerchantId) {
            return 'web'
        }

        return 'bot'
    }

    private getHeader(headers: Record<string, any>, name: string) {
        const foundKey = Object.keys(headers || {}).find((key) => key.toLowerCase() === name)
        return foundKey ? String(headers[foundKey] || '').trim() : ''
    }

    private safeEqual(actual: string, expected: string) {
        const actualBuffer = Buffer.from(actual)
        const expectedBuffer = Buffer.from(expected)
        if (actualBuffer.length !== expectedBuffer.length) {
            return false
        }

        return timingSafeEqual(actualBuffer, expectedBuffer)
    }

    private assertWebhookShape(payload: any) {
        if (!payload || typeof payload !== 'object' || !payload.id || !payload.status) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Platega webhook payload is invalid')
        }
    }

    private parsePayload(payload: any) {
        if (!payload) {
            return {}
        }

        if (typeof payload === 'object') {
            return payload
        }

        try {
            return JSON.parse(String(payload))
        } catch {
            return { payload: String(payload) }
        }
    }

    private parseJson(value: string) {
        try {
            return JSON.parse(value)
        } catch {
            return {}
        }
    }

    private safeResponseSnapshot(response: Record<string, any>) {
        return {
            transactionId: response?.transactionId || response?.id,
            status: response?.status,
            expiresIn: response?.expiresIn,
            rate: response?.rate,
            merchantId: response?.merchantId,
            usdtRate: response?.usdtRate,
            hasUrl: Boolean(response?.url || response?.redirect || response?.payformUrl || response?.payformSuccessUrl),
        }
    }
}
