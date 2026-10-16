import { BadGatewayException, Injectable } from '@nestjs/common'

import { PlategaMerchantProfile, PlategaPaymentProvider } from './platega-payment.provider'

export interface CreatePlategaSubscriptionInput {
    merchantProfile: PlategaMerchantProfile
    amount: number
    currency: string
    interval: number
    intervalCount: number
    description: string
}

export interface PlategaSubscriptionSnapshot {
    providerSubscriptionId: string
    status: string
    redirect?: string | null
    merchantId?: string | null
    amount?: number | null
    currency?: string | null
    intervalUnit?: string | null
    intervalCount?: number | null
    nextChargeAt?: string | null
    lastChargeAt?: string | null
}

@Injectable()
export class PlategaRecurrentProvider {
    constructor(private readonly transport: PlategaPaymentProvider) {}

    verifyCallback(headers: Record<string, any>): PlategaMerchantProfile {
        return this.transport.verifyMerchantHeaders(headers)
    }

    isConfigured(merchantProfile: PlategaMerchantProfile): boolean {
        return this.transport.isMerchantConfigured(merchantProfile)
    }

    async createSubscription(input: CreatePlategaSubscriptionInput): Promise<PlategaSubscriptionSnapshot> {
        const response = await this.transport.requestApi(
            '/transaction/process',
            {
                method: 'POST',
                body: JSON.stringify({
                    paymentMethod: 6,
                    paymentDetails: {
                        amount: Number(input.amount),
                        currency: input.currency,
                        interval: input.interval,
                        intervalCount: input.intervalCount,
                    },
                    description: input.description,
                }),
            },
            input.merchantProfile,
        )
        const providerSubscriptionId = String(response?.transactionId || '')
        if (!providerSubscriptionId) throw new BadGatewayException('Platega did not return transactionId')
        return this.toSnapshot(response, providerSubscriptionId)
    }

    async getSubscription(
        providerSubscriptionId: string,
        merchantProfile: PlategaMerchantProfile,
    ): Promise<PlategaSubscriptionSnapshot> {
        const response = await this.transport.requestApi(
            `/subscription/${encodeURIComponent(providerSubscriptionId)}`,
            { method: 'GET' },
            merchantProfile,
        )
        return this.toSnapshot(response, providerSubscriptionId)
    }

    async cancelSubscription(
        providerSubscriptionId: string,
        merchantProfile: PlategaMerchantProfile,
    ): Promise<PlategaSubscriptionSnapshot> {
        const response = await this.transport.requestApi(
            `/subscription/${encodeURIComponent(providerSubscriptionId)}/cancel`,
            { method: 'POST' },
            merchantProfile,
        )
        return this.toSnapshot(response, providerSubscriptionId)
    }

    private toSnapshot(response: any, fallbackId: string): PlategaSubscriptionSnapshot {
        return {
            providerSubscriptionId: String(response?.subscriptionId || response?.transactionId || fallbackId),
            status: String(response?.status || 'UNKNOWN'),
            redirect: response?.redirect ? String(response.redirect) : null,
            merchantId: response?.merchantId ? String(response.merchantId) : null,
            amount: response?.amount == null ? null : Number(response.amount),
            currency: response?.currencyCode ? String(response.currencyCode) : null,
            intervalUnit: response?.intervalUnit ? String(response.intervalUnit) : null,
            intervalCount: response?.intervalCount == null ? null : Number(response.intervalCount),
            nextChargeAt: response?.nextChargeAt ? String(response.nextChargeAt) : null,
            lastChargeAt: response?.lastChargeAt ? String(response.lastChargeAt) : null,
        }
    }
}
