import { randomUUID } from 'crypto'

import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import type { PaymentCanonicalProcessingService } from './payment-canonical-processing.service'
import { PaymentProviderRoutingService } from './payment-provider-routing.service'
import { PaymentReceiptPolicyService } from './payment-receipt-policy.service'
import {
    PAYMENT_CANONICAL_PROCESSING,
    PAYMENT_SUBSCRIPTION_ORCHESTRATOR,
    PAYMENT_SUBSCRIPTION_SERVICE,
} from './payment-service.tokens'
import { PaymentSideEffectsService } from './payment-side-effects.service'
import { AnalyticsService } from '../../analytics/services/analytics.service'
import { Plan } from '../../plan/entity/plan.entity'
import { PromoService } from '../../promo/services/promo.service'
import { ReferralService } from '../../referral/services/referral.service'
import { Subscription } from '../../subscription/entity/subscription.entity'
import type { SubscriptionLifecycleOrchestrator } from '../../subscription/services/subscription-lifecycle.orchestrator'
import type { SubscriptionService } from '../../subscription/services/subscription.service'
import { Payment } from '../entity/payment.entity'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentKind } from '../enum/payment-kind.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'
import { PaymentProviderError } from '../errors/payment-provider.error'
import { PLATEGA_PROVIDER, PlategaMerchantProfile, PlategaPaymentProvider } from '../providers/platega-payment.provider'
import { inspectPlategaRecurrentPlan } from '../providers/platega-recurrent-plan.policy'
import { YooKassaPaymentProvider } from '../providers/yookassa-payment.provider'
import { PaymentMethodConsentSource } from '../types/payment-method-consent-source'

export const BONUS_BALANCE_PROVIDER = 'bonus_balance'
export const PROMO_FULL_DISCOUNT_PROVIDER = 'promo_discount'

@Injectable()
export class PaymentCreateService {
    constructor(
        @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
        @InjectRepository(Plan) private readonly planRepository: Repository<Plan>,
        @Inject(PAYMENT_SUBSCRIPTION_SERVICE) private readonly subscriptionService: SubscriptionService,
        @Inject(PAYMENT_SUBSCRIPTION_ORCHESTRATOR)
        private readonly orchestrator: SubscriptionLifecycleOrchestrator,
        private readonly plategaProvider: PlategaPaymentProvider,
        private readonly referralService: ReferralService,
        private readonly promoService: PromoService,
        private readonly analyticsService: AnalyticsService,
        private readonly yookassaProvider: YooKassaPaymentProvider,
        private readonly paymentProviderRouting: PaymentProviderRoutingService,
        private readonly paymentSideEffects: PaymentSideEffectsService,
        @Optional() private readonly receiptPolicy?: PaymentReceiptPolicyService,
        @Inject(PAYMENT_CANONICAL_PROCESSING)
        @Optional()
        private readonly canonicalProcessing?: PaymentCanonicalProcessingService,
        @Optional() private readonly config?: ConfigService,
    ) {}

    async getSubscriptionForUser(userId: string) {
        const subscription = await this.subscriptionService.getOne({
            where: { userId },
            relations: { plan: true, user: true },
        })
        if (!subscription) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
        return subscription
    }

    async createPayment(
        subscription: string | Subscription,
        planId?: string,
        promoCode?: string,
        merchantProfile: PlategaMerchantProfile = 'bot',
        options: { checkoutMode?: PaymentCheckoutMode } = {},
    ) {
        const checkoutMode = options.checkoutMode || PaymentCheckoutMode.ONE_TIME
        const isCrypto = checkoutMode === PaymentCheckoutMode.PLATEGA_CRYPTO
        if (isCrypto && this.config?.get<string>('PLATEGA_CRYPTO_ENABLED') !== 'true') {
            throw new ServiceUnavailableException('Platega crypto payments are disabled')
        }
        if (typeof subscription === 'string') {
            subscription = await this.subscriptionService.getOne({
                where: { id: subscription },
                relations: { plan: true, user: true },
            })
        }

        if (!subscription) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
        }
        if (!subscription.plan) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Plan not found for subscription')
        }

        let billedPlan = subscription.plan
        if (planId && planId !== subscription.planId) {
            const targetPlan = await this.planRepository.findOne({
                where: isCrypto ? { id: planId, isActive: true } : { id: planId },
            })
            if (!targetPlan) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Plan not found')
            }
            billedPlan = targetPlan
        }
        if (isCrypto && !inspectPlategaRecurrentPlan(billedPlan).canonical) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Plan not found')
        }

        await this.analyticsService.trackPlanSelected(subscription.userId, billedPlan)

        const appliedPromo = promoCode
            ? await this.promoService.validatePromoForUser(promoCode, subscription.userId, billedPlan.amount)
            : null
        const originalAmount = Number(billedPlan.amount) || 0
        const discountAmount = appliedPromo
            ? this.promoService.calculateDiscountAmount(originalAmount, appliedPromo.valuePercent)
            : 0
        const finalAmount = appliedPromo
            ? this.promoService.calculateFinalAmount(originalAmount, appliedPromo.valuePercent)
            : originalAmount

        const idempotencyKey = randomUUID()

        let localPayment: Payment = await this.paymentRepository.save({
            amount: finalAmount,
            currency: 'RUB',
            status: PaymentStatusEnum.PENDING,
            provider: PLATEGA_PROVIDER,
            user: subscription.user as any,
            userId: subscription.userId,
            subscription: { id: subscription.id } as any,
            subscriptionId: subscription.id,
            plan: { id: billedPlan.id } as any,
            planId: billedPlan.id,
            paymentPayId: '',
            paymentLink: '',
            paymentUrl: '',
            returnUrl: '',
            idempotencyKey,
            metadataSnapshot: {
                subscription_id: subscription.id,
                plan_id: billedPlan.id,
                promo_code: appliedPromo?.code || '',
                promo_id: appliedPromo?.id || '',
                original_amount: originalAmount,
                discount_amount: discountAmount,
                discount_percent: appliedPromo?.valuePercent || 0,
                promo_duration_days: appliedPromo?.durationDays || null,
                promo_devices_limit: appliedPromo?.devicesLimit || null,
                payment_profile: merchantProfile,
            },
        } as any)

        const returnUrl = this.paymentProviderRouting.buildPaymentReturnUrl('success', localPayment.id, merchantProfile)
        const failedUrl = this.paymentProviderRouting.buildPaymentReturnUrl('fail', localPayment.id, merchantProfile)
        localPayment.returnUrl = returnUrl
        localPayment.metadataSnapshot = {
            ...(localPayment.metadataSnapshot || {}),
            returnUrl,
            failedUrl,
        }
        localPayment = await this.paymentRepository.save(localPayment)

        let reservedPromoId: string | null = null
        if (appliedPromo) {
            await this.promoService.reserveUsage(appliedPromo.id, subscription.userId)
            reservedPromoId = appliedPromo.id
        }

        if (finalAmount <= 0) {
            const paidAt = new Date()
            localPayment.status = PaymentStatusEnum.SUCCEEDED
            localPayment.provider = PROMO_FULL_DISCOUNT_PROVIDER
            localPayment.providerPaymentId = idempotencyKey
            localPayment.paymentPayId = idempotencyKey
            localPayment.paidAt = paidAt
            localPayment = await this.paymentRepository.save(localPayment)
            if (appliedPromo) {
                await this.paymentSideEffects.finalizePaymentPromo(localPayment, appliedPromo.id, paidAt)
            }

            await this.orchestrator.activatePaidSubscription({
                subscriptionId: subscription.id,
                planId: billedPlan.id,
                paymentId: localPayment.id,
                paidAmountRub: 0,
                paymentExternalId: idempotencyKey,
                promoTerms: appliedPromo
                    ? {
                          durationDays: appliedPromo.durationDays,
                          devicesLimit: appliedPromo.devicesLimit,
                      }
                    : undefined,
                operationKey: `promo-full-discount:${localPayment.id}`,
                paidAt,
            })

            await this.paymentSideEffects.notifyPaymentSucceeded(localPayment)
            return {
                ok: true,
                status: PaymentStatusEnum.SUCCEEDED,
                localPaymentId: localPayment.id,
                paidWithPromo: true,
                promo: appliedPromo
                    ? {
                          code: appliedPromo.code,
                          valuePercent: appliedPromo.valuePercent,
                          durationDays: appliedPromo.durationDays,
                          devicesLimit: appliedPromo.devicesLimit,
                      }
                    : null,
                originalAmount,
                discountAmount,
                finalAmount,
                paymentUrl: '',
                paymentLink: '',
                redirectUrl: '/dashboard',
            }
        }

        let primaryProvider = PaymentProvider.PLATEGA
        try {
            primaryProvider = this.paymentProviderRouting.resolveCheckoutProvider(checkoutMode, subscription.userId)
            if (primaryProvider === PaymentProvider.PLATEGA) {
                localPayment.provider = PLATEGA_PROVIDER
                localPayment.kind = PaymentKind.EXTERNAL
                localPayment.merchant = this.paymentProviderRouting.resolveMerchant(merchantProfile)
                localPayment.metadataSnapshot = {
                    ...(localPayment.metadataSnapshot || {}),
                    ...(isCrypto ? { platega_payment_method: 13 } : {}),
                    payment_channel: isCrypto ? 'PLATEGA_CRYPTO' : 'PLATEGA_ONE_TIME',
                }
                localPayment = await this.paymentRepository.save(localPayment)
            }
            if (primaryProvider === PaymentProvider.YOOKASSA) {
                localPayment.provider = 'yookassa'
                localPayment.kind = PaymentKind.EXTERNAL
                localPayment.merchant = this.paymentProviderRouting.resolveMerchant(merchantProfile)
                localPayment = await this.paymentRepository.save(localPayment)
            }
            this.paymentProviderRouting.assertProviderAvailable(primaryProvider)
            if (primaryProvider === PaymentProvider.YOOKASSA) {
                return await this.createYooKassaPayment({
                    localPayment,
                    subscription,
                    billedPlan,
                    merchantProfile,
                    appliedPromo,
                    originalAmount,
                    discountAmount,
                    finalAmount,
                })
            }

            const providerPayment = await this.plategaProvider.createPayment({
                amount: finalAmount,
                currency: 'RUB',
                description: `Оплата VPN тарифа ${billedPlan.title || billedPlan.name || billedPlan.code || billedPlan.id}`,
                returnUrl,
                failedUrl,
                idempotencyKey,
                metadata: {
                    subscription_id: subscription.id,
                    plan_id: billedPlan.id,
                    user_id: subscription.userId,
                    promo_code: appliedPromo?.code || '',
                    promo_id: appliedPromo?.id || '',
                    original_amount: originalAmount,
                    discount_amount: discountAmount,
                    discount_percent: appliedPromo?.valuePercent || 0,
                    promo_duration_days: appliedPromo?.durationDays || null,
                    promo_devices_limit: appliedPromo?.devicesLimit || null,
                    local_payment_id: localPayment.id,
                    payment_profile: merchantProfile,
                },
                merchantProfile,
                checkoutMode,
            })

            localPayment.providerPaymentId = providerPayment.providerPaymentId
            localPayment.providerInvoiceId = providerPayment.providerInvoiceId || undefined
            localPayment.paymentUrl = providerPayment.paymentUrl
            localPayment.paymentLink = providerPayment.paymentUrl
            localPayment.paymentPayId = providerPayment.providerPaymentId
            localPayment.metadataSnapshot = {
                ...(localPayment.metadataSnapshot || {}),
                providerResponse: this.safeProviderSnapshot(providerPayment.raw),
            } as Record<string, any>
            localPayment = await this.paymentRepository.save(localPayment)

            return {
                ...providerPayment.raw,
                localPaymentId: localPayment.id,
                promo: appliedPromo
                    ? {
                          code: appliedPromo.code,
                          valuePercent: appliedPromo.valuePercent,
                          durationDays: appliedPromo.durationDays,
                          devicesLimit: appliedPromo.devicesLimit,
                      }
                    : null,
                originalAmount,
                discountAmount,
                finalAmount,
                paymentLink: localPayment.paymentUrl,
                paymentUrl: localPayment.paymentUrl,
                confirmation: {
                    ...(providerPayment.raw?.confirmation || {}),
                    confirmation_url: localPayment.paymentUrl,
                },
            }
        } catch (error: any) {
            if (primaryProvider === PaymentProvider.YOOKASSA && error instanceof PaymentProviderError) {
                const merchant = error.merchant || this.paymentProviderRouting.resolveMerchant(merchantProfile)
                localPayment.metadataSnapshot = {
                    ...(localPayment.metadataSnapshot || {}),
                    provider: 'yookassa',
                    merchant,
                    providerCreateError: {
                        kind: error.kind,
                        statusCode: error.statusCode,
                        providerCode: error.providerCode,
                        providerType: error.providerType,
                        providerDescription: error.providerDescription,
                        providerParameter: error.providerParameter,
                        providerRequestIdMasked: error.providerRequestIdMasked,
                    },
                } as Record<string, any>

                if (error.kind === 'OUTCOME_UNKNOWN') {
                    localPayment.status = PaymentStatusEnum.PENDING
                    localPayment.externalStatus = 'creation_outcome_unknown'
                    await this.paymentRepository.save(localPayment)
                    throw new PaymentProviderError({
                        message: 'Payment creation status is being clarified; do not retry through another provider',
                        provider: PaymentProvider.YOOKASSA,
                        merchant,
                        kind: 'OUTCOME_UNKNOWN',
                        statusCode: error.statusCode,
                        providerCode: error.providerCode,
                        providerType: error.providerType,
                        providerDescription: error.providerDescription,
                        providerParameter: error.providerParameter,
                        providerRequestIdMasked: error.providerRequestIdMasked,
                        cause: error,
                    })
                }

                localPayment.status = PaymentStatusEnum.FAILED
                localPayment.failedAt = new Date()
                localPayment.externalStatus =
                    error.kind === 'CONFIGURATION' ? 'configuration_error' : 'terminal_request_error'
                await this.paymentRepository.save(localPayment)
                if (reservedPromoId) {
                    await this.paymentSideEffects.cancelPaymentPromo(
                        localPayment,
                        reservedPromoId,
                        localPayment.failedAt,
                    )
                }
                throw error
            }

            localPayment.status = PaymentStatusEnum.FAILED
            localPayment.failedAt = new Date()
            localPayment.metadataSnapshot = {
                ...(localPayment.metadataSnapshot || {}),
                providerCreateError: error?.message || 'unknown',
            } as Record<string, any>
            await this.paymentRepository.save(localPayment)
            if (reservedPromoId) {
                await this.paymentSideEffects.cancelPaymentPromo(localPayment, reservedPromoId, localPayment.failedAt)
            }
            throw error
        }
    }

    private async createYooKassaPayment(input: {
        localPayment: Payment
        subscription: Subscription
        billedPlan: Plan
        merchantProfile: PlategaMerchantProfile
        appliedPromo: any
        originalAmount: number
        discountAmount: number
        finalAmount: number
    }) {
        const merchant = this.paymentProviderRouting.resolveMerchant(input.merchantProfile)
        const idempotencyKey = input.localPayment.idempotencyKey || ''
        input.localPayment.provider = 'yookassa'
        input.localPayment.kind = PaymentKind.EXTERNAL
        input.localPayment.merchant = merchant
        input.localPayment.idempotencyKey = idempotencyKey
        input.localPayment.metadataSnapshot = {
            ...(input.localPayment.metadataSnapshot || {}),
            // ONE_TIME must never enter the legacy saved-method/auto-renew path.
            payment_method_consent_source: PaymentMethodConsentSource.NONE,
        } as Record<string, any>
        input.localPayment = await this.paymentRepository.save(input.localPayment)

        const created = await this.yookassaProvider.createPayment({
            localPaymentId: input.localPayment.id,
            idempotencyKey,
            merchant,
            amountRub: input.finalAmount,
            description: `Оплата VPN тарифа ${
                input.billedPlan.title || input.billedPlan.name || input.billedPlan.code || input.billedPlan.id
            }`,
            returnUrl: input.localPayment.returnUrl,
            subscriptionId: input.subscription.id,
            planId: input.billedPlan.id,
            paymentMethodConsentSource: PaymentMethodConsentSource.NONE,
            receipt:
                this.receiptPolicy?.buildReceipt({
                    merchant,
                    customerEmail: input.subscription.user?.email,
                    amountRub: input.finalAmount,
                    itemDescription: `Оплата VPN тарифа ${
                        input.billedPlan.title || input.billedPlan.name || input.billedPlan.code || input.billedPlan.id
                    }`,
                }) || null,
        })

        input.localPayment.provider = 'yookassa'
        input.localPayment.kind = PaymentKind.EXTERNAL
        input.localPayment.merchant = merchant
        input.localPayment.providerPaymentId = created.providerPaymentId
        input.localPayment.providerInvoiceId = created.providerInvoiceId || undefined
        input.localPayment.paymentUrl = created.confirmationUrl || ''
        input.localPayment.paymentLink = created.confirmationUrl || ''
        input.localPayment.paymentPayId = created.providerPaymentId
        input.localPayment.externalStatus = created.externalStatus
        input.localPayment.status = created.status
        input.localPayment.metadataSnapshot = {
            ...(input.localPayment.metadataSnapshot || {}),
            provider: 'yookassa',
            merchant,
            confirmation_available: Boolean(created.confirmationUrl),
            yookassa: created.safeResponseSnapshot,
        } as Record<string, any>
        input.localPayment = await this.paymentRepository.save(input.localPayment)
        if (created.status === PaymentStatusEnum.SUCCEEDED && this.canonicalProcessing) {
            await this.canonicalProcessing.processCanonicalPayment({
                paymentId: input.localPayment.id,
                merchant,
                canonical: created,
                source: 'STATUS',
            })
        }

        return {
            ok: true,
            status: created.status,
            localPaymentId: input.localPayment.id,
            promo: input.appliedPromo
                ? {
                      code: input.appliedPromo.code,
                      valuePercent: input.appliedPromo.valuePercent,
                      durationDays: input.appliedPromo.durationDays,
                      devicesLimit: input.appliedPromo.devicesLimit,
                  }
                : null,
            originalAmount: input.originalAmount,
            discountAmount: input.discountAmount,
            finalAmount: input.finalAmount,
            paymentLink: input.localPayment.paymentUrl,
            paymentUrl: input.localPayment.paymentUrl,
            confirmation: {
                confirmation_url: input.localPayment.paymentUrl,
            },
        }
    }

    async createBonusPayment(
        subscription: string | Subscription,
        planId?: string,
        options: { notifySuccess?: boolean } = {},
    ) {
        if (typeof subscription === 'string') {
            subscription = await this.subscriptionService.getOne({
                where: { id: subscription },
                relations: { plan: true, user: true },
            })
        }

        if (!subscription) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
        }
        if (!subscription.plan) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Plan not found for subscription')
        }

        let billedPlan = subscription.plan
        if (planId && planId !== subscription.planId) {
            const targetPlan = await this.planRepository.findOne({ where: { id: planId } })
            if (!targetPlan) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Plan not found')
            }
            billedPlan = targetPlan
        }

        await this.analyticsService.trackPlanSelected(subscription.userId, billedPlan)

        const amountRub = Number(billedPlan.amount) || 0
        const idempotencyKey = `bonus:${subscription.id}:${billedPlan.id}:${randomUUID()}`
        const paidAt = new Date()
        let redeemed = false

        let localPayment: Payment = await this.paymentRepository.save({
            amount: amountRub,
            currency: 'RUB',
            status: PaymentStatusEnum.PENDING,
            provider: BONUS_BALANCE_PROVIDER,
            user: subscription.user as any,
            userId: subscription.userId,
            subscription: { id: subscription.id } as any,
            subscriptionId: subscription.id,
            plan: { id: billedPlan.id } as any,
            planId: billedPlan.id,
            paymentPayId: idempotencyKey,
            paymentLink: '',
            paymentUrl: '',
            returnUrl: '',
            providerPaymentId: idempotencyKey,
            idempotencyKey,
            metadataSnapshot: {
                subscription_id: subscription.id,
                plan_id: billedPlan.id,
                payment_source: BONUS_BALANCE_PROVIDER,
            },
        } as any)

        try {
            await this.referralService.redeemFullPayment(subscription.userId, amountRub, { notify: false })
            redeemed = true

            localPayment.status = PaymentStatusEnum.SUCCEEDED
            localPayment.paidAt = paidAt
            await this.paymentRepository.save(localPayment)

            await this.orchestrator.activatePaidSubscription({
                subscriptionId: subscription.id,
                planId: billedPlan.id,
                paymentId: localPayment.id,
                paidAmountRub: 0,
                paymentExternalId: idempotencyKey,
                operationKey: `bonus-payment:${localPayment.id}`,
                paidAt,
            })

            if (options.notifySuccess !== false) {
                await this.paymentSideEffects.notifyPaymentSucceeded(localPayment)
            }
            return {
                ok: true,
                status: PaymentStatusEnum.SUCCEEDED,
                localPaymentId: localPayment.id,
                paidWithBonus: true,
                bonusChargedRub: amountRub,
            }
        } catch (error: any) {
            if (redeemed) {
                await this.referralService.refundBonusPayment(subscription.userId, amountRub, { notify: false })
            }

            localPayment.status = PaymentStatusEnum.FAILED
            localPayment.failedAt = new Date()
            localPayment.metadataSnapshot = {
                ...(localPayment.metadataSnapshot || {}),
                bonusPaymentError: error?.message || 'unknown',
            } as Record<string, any>
            await this.paymentRepository.save(localPayment)
            throw error
        }
    }

    private safeProviderSnapshot(raw: Record<string, any>) {
        return {
            transactionId: raw?.transactionId,
            id: raw?.id,
            status: raw?.status,
            hasUrl: raw?.hasUrl,
            expiresIn: raw?.expiresIn,
        }
    }
}
