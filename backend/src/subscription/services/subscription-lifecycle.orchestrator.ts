import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { AnalyticsService } from '../../analytics/services/analytics.service'
import { BillingService } from '../../billing/billing.service'
import { tgEmoji } from '../../bot/custom-emoji.registry'
import { NotificationService } from '../../notification/notification.service'
import { PaymentService } from '../../payment/services/payment.service'
import { Plan } from '../../plan/entity/plan.entity'
import { ReferralService } from '../../referral/services/referral.service'
import { ReferralRewardCalculation } from '../../referral/utils/referral-reward-calculator'
import { SubscriptionPolicyService } from '../../subscription-policy/subscription-policy.service'
import { User } from '../../system/user/entity/user.entity'
import {
    AccessOperationStatusEnum,
    AccessOperationTypeEnum,
} from '../../vpn-access/operations/access-operation-log.entity'
import { AccessOperationService } from '../../vpn-access/operations/access-operation.service'
import { VpnAccessService } from '../../vpn-access/services/vpn-access.service'
import { RemnawaveProviderAdapter } from '../../vpn-provider/adapters/remnawave-provider.adapter'
import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'
import { ServerNodeResolverService } from '../../vpn-provider/services/server-node-resolver.service'
import { Subscription } from '../entity/subscription.entity'
import { StatusesEnum } from '../enum/statuses.enum'

const VPN_DEVICE_SLOTS_METER_CODE = 'vpn_device_slots'
const PROVIDER_USERNAME_BASE_MAX_LENGTH = 30
const PROVIDER_USERNAME_MAX_LENGTH = 48

@Injectable()
export class SubscriptionLifecycleOrchestrator {
    private readonly logger = new Logger(SubscriptionLifecycleOrchestrator.name)

    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        @InjectRepository(Plan)
        private readonly planRepository: Repository<Plan>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly vpnAccessService: VpnAccessService,
        private readonly remnawaveProvider: RemnawaveProviderAdapter,
        private readonly policyService: SubscriptionPolicyService,
        private readonly referralService: ReferralService,
        private readonly serverNodeResolver: ServerNodeResolverService,
        private readonly operationService: AccessOperationService,
        private readonly billingService: BillingService,
        private readonly analyticsService: AnalyticsService,
        @Inject(forwardRef(() => PaymentService)) private readonly paymentService: PaymentService,
        private readonly notificationService: NotificationService,
    ) {}

    async activatePaidSubscription(input: {
        subscriptionId: string
        planId: string
        paymentExternalId?: string
        paymentId?: string
        paidAmountRub?: number
        promoTerms?: {
            durationDays?: number | null
            devicesLimit?: number | null
        }
        operationKey: string
        paidAt?: Date
        localStateAlreadyApplied?: boolean
        referralRewardCalculation?: ReferralRewardCalculation
    }) {
        const paidAt = input.paidAt || new Date()
        const begin = await this.operationService.begin({
            operationKey: input.operationKey,
            operationType: AccessOperationTypeEnum.ENSURE,
            subscriptionId: input.subscriptionId,
            providerType: VpnProviderTypeEnum.REMNAWAVE,
        })
        if (!begin.isNew && begin.existing.status === AccessOperationStatusEnum.SUCCESS) {
            return this.subscriptionRepository.findOneOrFail({ where: { id: input.subscriptionId } })
        }
        const subscription = await this.subscriptionRepository.findOneOrFail({
            where: { id: input.subscriptionId },
            relations: { user: true, plan: true },
        })
        if (!subscription.plan || subscription.planId !== input.planId) {
            const plan = await this.planRepository.findOneOrFail({ where: { id: input.planId } })
            subscription.plan = plan
        }

        const user = subscription.user
        let period: { startsAt: Date; nextPayAt: Date; endsAt: Date }
        if (input.localStateAlreadyApplied) {
            period = {
                startsAt: subscription.startAt,
                nextPayAt: subscription.nextPayAt,
                endsAt: subscription.endsAt,
            }
        } else {
            subscription.planId = input.planId
            subscription.status = StatusesEnum.ACTIVE
            subscription.yookassaPaymentId = input.paymentExternalId || subscription.yookassaPaymentId || ''
            const paidPeriodDays = input.promoTerms?.durationDays || subscription.plan.period
            period = this.policyService.computePaidPeriod(paidPeriodDays, paidAt)
            subscription.startAt = period.startsAt
            subscription.nextPayAt = period.nextPayAt
            subscription.endsAt = period.endsAt
            subscription.graceEndsAt = null
            subscription.accessDisabledAt = null
            subscription.isTrial = false
            subscription.trialEndsAt = null
            subscription.reminderState = {}
        }

        const node = await this.serverNodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE)
        const hwidDeviceLimit = input.promoTerms?.devicesLimit || (await this.getHwidDeviceLimit(subscription.planId))
        const access = await this.vpnAccessService.createOrGetActiveAccess({
            subscriptionId: subscription.id,
            userId: subscription.userId,
            providerType: VpnProviderTypeEnum.REMNAWAVE,
            serverNodeId: node.id,
            inboundKey: this.getNodeAccessKey(node),
            accessStartsAt: period.startsAt,
            accessEndsAt: period.endsAt,
        })

        let providerState
        try {
            const providerUsername = this.resolveProviderUsername(access, user)
            providerState = await this.remnawaveProvider.ensureAccess({
                operationKey: input.operationKey,
                userKey: providerUsername,
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey || providerUsername,
                inboundKey: access.inboundKey,
                telegramId: user.telegramId,
                email: user.email,
                hwidDeviceLimit,
                expiresAt: period.endsAt,
                serverBaseUrl: node.baseUrl,
            })
        } catch (e: any) {
            await this.operationService.fail(input.operationKey, e?.message || 'ensureAccess failed')
            await this.vpnAccessService.markError(access.id, e?.message || 'ensureAccess failed')
            throw e
        }

        await this.vpnAccessService.markProvisioned(access.id, {
            providerExternalId: providerState.providerExternalId,
            providerClientKey: providerState.providerClientKey,
            subscriptionUrl: providerState.subscriptionUrl,
            qrPayload: providerState.qrPayload,
            configPayload: providerState.configPayload,
            accessEndsAt: period.endsAt,
            idempotencyKey: input.operationKey,
        })

        subscription.lastProvisionedAt = new Date()
        await this.subscriptionRepository.save(subscription)

        if (!user.firstPaidAt) {
            user.firstPaidAt = paidAt
            await this.userRepository.save(user)
        }

        await this.analyticsService.trackPaymentSucceeded({
            userId: user.id,
            amountRub: input.paidAmountRub || 0,
            planId: subscription.planId,
            planCode: subscription.plan.code,
            planTitle: subscription.plan.title || subscription.plan.name,
            paidAt,
            isAfterTrial: Boolean(user.hasUsedTrial || subscription.isTrial || subscription.trialEndsAt),
        })

        await this.referralService.awardPaymentBonus({
            userId: user.id,
            subscriptionId: subscription.id,
            paymentId: input.paymentId,
            amountRub: input.paidAmountRub || 0,
            paidAt,
            rewardCalculation: input.referralRewardCalculation,
        })

        await this.operationService.succeed(input.operationKey, {
            subscriptionId: subscription.id,
            accessId: access.id,
        })

        return subscription
    }

    async activateTrial(input: { subscriptionId: string; operationKey: string; promoCode?: string }) {
        const subscription = await this.subscriptionRepository.findOneOrFail({
            where: { id: input.subscriptionId },
            relations: { user: true, plan: true },
        })

        await this.restoreFailedTrialUsageIfNeeded(subscription)
        this.policyService.assertTrialAllowed(subscription.user, subscription.plan, Boolean(input.promoCode))

        const trialPeriod = this.policyService.computeTrialPeriod(new Date())

        const node = await this.serverNodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE)
        const hwidDeviceLimit = await this.getHwidDeviceLimit(subscription.planId)
        const access = await this.vpnAccessService.createOrGetActiveAccess({
            subscriptionId: subscription.id,
            userId: subscription.userId,
            providerType: VpnProviderTypeEnum.REMNAWAVE,
            serverNodeId: node.id,
            inboundKey: this.getNodeAccessKey(node),
            accessStartsAt: trialPeriod.startsAt,
            accessEndsAt: trialPeriod.endsAt,
        })

        let providerState
        try {
            const providerUsername = this.resolveProviderUsername(access, subscription.user)
            providerState = await this.remnawaveProvider.ensureAccess({
                operationKey: input.operationKey,
                userKey: providerUsername,
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey || providerUsername,
                inboundKey: access.inboundKey,
                telegramId: subscription.user.telegramId,
                email: subscription.user.email,
                hwidDeviceLimit,
                expiresAt: trialPeriod.endsAt,
                serverBaseUrl: node.baseUrl,
            })
        } catch (e: any) {
            await this.vpnAccessService.markError(access.id, e?.message || 'ensureAccess failed')
            throw e
        }

        await this.vpnAccessService.markProvisioned(access.id, {
            providerExternalId: providerState.providerExternalId,
            providerClientKey: providerState.providerClientKey,
            subscriptionUrl: providerState.subscriptionUrl,
            qrPayload: providerState.qrPayload,
            configPayload: providerState.configPayload,
            accessEndsAt: trialPeriod.endsAt,
            idempotencyKey: input.operationKey,
        })

        subscription.status = StatusesEnum.ACTIVE
        subscription.isTrial = true
        subscription.startAt = trialPeriod.startsAt
        subscription.endsAt = trialPeriod.endsAt
        subscription.trialEndsAt = trialPeriod.endsAt
        subscription.nextPayAt = trialPeriod.endsAt
        subscription.graceEndsAt = null
        subscription.accessDisabledAt = null
        subscription.lastProvisionedAt = new Date()
        subscription.reminderState = {}
        subscription.user.hasUsedTrial = true
        subscription.user.trialUsedAt = new Date()
        await this.userRepository.save(subscription.user)
        const saved = await this.subscriptionRepository.save(subscription)
        await this.analyticsService.trackTrialStarted(subscription.userId, subscription.plan)
        return saved
    }

    async stopSubscription(input: { subscriptionId: string; operationKey: string }) {
        const begin = await this.operationService.begin({
            operationKey: input.operationKey,
            operationType: AccessOperationTypeEnum.DISABLE,
            subscriptionId: input.subscriptionId,
            providerType: VpnProviderTypeEnum.REMNAWAVE,
        })
        if (!begin.isNew && begin.existing.status === AccessOperationStatusEnum.SUCCESS) {
            return this.subscriptionRepository.findOneOrFail({ where: { id: input.subscriptionId } })
        }
        const subscription = await this.subscriptionRepository.findOneOrFail({
            where: { id: input.subscriptionId },
        })

        const activeAccess = await this.vpnAccessService.findProvisionableBySubscription(subscription.id)
        if (activeAccess) {
            const node = await this.serverNodeResolver.resolveNode(
                VpnProviderTypeEnum.REMNAWAVE,
                activeAccess.serverNodeId,
            )
            try {
                await this.remnawaveProvider.disableAccess({
                    operationKey: input.operationKey,
                    inboundKey: activeAccess.inboundKey,
                    providerExternalId: activeAccess.providerExternalId,
                    providerClientKey: activeAccess.providerClientKey,
                    serverBaseUrl: node.baseUrl,
                })
            } catch (e: any) {
                await this.operationService.fail(input.operationKey, e?.message || 'disableAccess failed')
                await this.vpnAccessService.markError(activeAccess.id, e?.message || 'disableAccess failed')
                throw e
            }
            await this.vpnAccessService.markDisabled(activeAccess.id, 'Stopped by user/admin')
        }

        subscription.status = StatusesEnum.STOPPED
        subscription.accessDisabledAt = new Date()
        subscription.reminderState = {}
        const saved = await this.subscriptionRepository.save(subscription)
        await this.operationService.succeed(input.operationKey, {
            subscriptionId: subscription.id,
        })
        return saved
    }

    async enterGrace(subscriptionId: string, operationKey: string) {
        const subscription = await this.subscriptionRepository.findOneOrFail({ where: { id: subscriptionId } })
        if (subscription.status !== StatusesEnum.ACTIVE || !subscription.endsAt || subscription.endsAt > new Date()) {
            return subscription
        }

        subscription.status = StatusesEnum.GRACE
        subscription.graceEndsAt = this.policyService.computeGracePeriod(subscription.endsAt).graceEndsAt

        const activeAccess = await this.vpnAccessService.findActiveBySubscription(subscription.id)
        if (activeAccess) {
            const begin = await this.operationService.begin({
                operationKey,
                operationType: AccessOperationTypeEnum.EXTEND,
                subscriptionId,
                accessId: activeAccess.id,
                providerType: VpnProviderTypeEnum.REMNAWAVE,
            })

            if (begin.isNew || begin.existing.status !== AccessOperationStatusEnum.SUCCESS) {
                const node = await this.serverNodeResolver.resolveNode(
                    VpnProviderTypeEnum.REMNAWAVE,
                    activeAccess.serverNodeId,
                )
                try {
                    const providerState = await this.remnawaveProvider.extendAccess({
                        operationKey,
                        inboundKey: activeAccess.inboundKey,
                        providerExternalId: activeAccess.providerExternalId,
                        providerClientKey: activeAccess.providerClientKey,
                        expiresAt: subscription.graceEndsAt,
                        serverBaseUrl: node.baseUrl,
                    })

                    await this.vpnAccessService.markProvisioned(activeAccess.id, {
                        providerExternalId: providerState.providerExternalId,
                        providerClientKey: providerState.providerClientKey,
                        subscriptionUrl: providerState.subscriptionUrl,
                        qrPayload: providerState.qrPayload,
                        configPayload: providerState.configPayload,
                        accessEndsAt: subscription.graceEndsAt,
                        idempotencyKey: operationKey,
                    })
                    await this.operationService.succeed(operationKey, {
                        accessId: activeAccess.id,
                        graceEndsAt: subscription.graceEndsAt,
                    })
                } catch (e: any) {
                    await this.operationService.fail(operationKey, e?.message || 'extendAccess for grace failed')
                    await this.vpnAccessService.markError(
                        activeAccess.id,
                        e?.message || 'extendAccess for grace failed',
                    )
                    throw e
                }
            }

            await this.vpnAccessService.markGrace(activeAccess.id)
        }

        return this.subscriptionRepository.save(subscription)
    }

    async expireFromGrace(subscriptionId: string, operationKey: string) {
        const subscription = await this.subscriptionRepository.findOneOrFail({
            where: { id: subscriptionId },
            relations: { plan: true, user: true },
        })
        if (
            subscription.status !== StatusesEnum.GRACE ||
            !subscription.graceEndsAt ||
            subscription.graceEndsAt > new Date()
        ) {
            return subscription
        }

        const autoRenewed = await this.tryAutoRenewFromBonus(subscription)
        if (autoRenewed) {
            return autoRenewed
        }

        const activeAccess = await this.vpnAccessService.findActiveBySubscription(subscription.id)
        if (activeAccess) {
            const node = await this.serverNodeResolver.resolveNode(
                VpnProviderTypeEnum.REMNAWAVE,
                activeAccess.serverNodeId,
            )
            await this.operationService.begin({
                operationKey,
                operationType: AccessOperationTypeEnum.DISABLE,
                subscriptionId,
                accessId: activeAccess.id,
                providerType: VpnProviderTypeEnum.REMNAWAVE,
            })
            try {
                await this.remnawaveProvider.disableAccess({
                    operationKey,
                    inboundKey: activeAccess.inboundKey,
                    providerExternalId: activeAccess.providerExternalId,
                    providerClientKey: activeAccess.providerClientKey,
                    serverBaseUrl: node.baseUrl,
                })
            } catch (e: any) {
                await this.operationService.fail(operationKey, e?.message || 'disableAccess failed')
                await this.vpnAccessService.markError(activeAccess.id, e?.message || 'disableAccess failed')
                throw e
            }
            await this.vpnAccessService.markDisabled(activeAccess.id, 'Grace period expired')
            await this.operationService.succeed(operationKey, { accessId: activeAccess.id })
        }

        subscription.status = StatusesEnum.EXPIRED
        subscription.accessDisabledAt = new Date()
        return this.subscriptionRepository.save(subscription)
    }

    async extendAfterManualRenew(input: {
        subscriptionId: string
        operationKey: string
        paymentExternalId?: string
        paidAt?: Date
    }) {
        const subscription = await this.subscriptionRepository.findOneOrFail({
            where: { id: input.subscriptionId },
            relations: { plan: true },
        })

        this.policyService.assertManualRenewAllowed(subscription)

        const baseDate = subscription.endsAt && subscription.endsAt > new Date() ? subscription.endsAt : new Date()
        const startsAt = new Date(baseDate)
        const endsAt = new Date(baseDate)
        endsAt.setDate(endsAt.getDate() + subscription.plan.period)

        subscription.status = StatusesEnum.ACTIVE
        subscription.yookassaPaymentId = input.paymentExternalId || subscription.yookassaPaymentId
        subscription.startAt = subscription.startAt || startsAt
        subscription.endsAt = endsAt
        subscription.nextPayAt = endsAt
        subscription.graceEndsAt = null
        subscription.accessDisabledAt = null
        subscription.reminderState = {}

        const activeAccess = await this.vpnAccessService.findActiveBySubscription(subscription.id)
        if (activeAccess) {
            const begin = await this.operationService.begin({
                operationKey: input.operationKey,
                operationType: AccessOperationTypeEnum.EXTEND,
                subscriptionId: input.subscriptionId,
                accessId: activeAccess.id,
                providerType: VpnProviderTypeEnum.REMNAWAVE,
            })
            if (!begin.isNew && begin.existing.status === AccessOperationStatusEnum.SUCCESS) {
                return this.subscriptionRepository.save(subscription)
            }
            const node = await this.serverNodeResolver.resolveNode(
                VpnProviderTypeEnum.REMNAWAVE,
                activeAccess.serverNodeId,
            )
            let providerState
            try {
                providerState = await this.remnawaveProvider.extendAccess({
                    operationKey: input.operationKey,
                    inboundKey: activeAccess.inboundKey,
                    providerExternalId: activeAccess.providerExternalId,
                    providerClientKey: activeAccess.providerClientKey,
                    expiresAt: endsAt,
                    serverBaseUrl: node.baseUrl,
                })
            } catch (e: any) {
                await this.operationService.fail(input.operationKey, e?.message || 'extendAccess failed')
                await this.vpnAccessService.markError(activeAccess.id, e?.message || 'extendAccess failed')
                throw e
            }

            await this.vpnAccessService.markProvisioned(activeAccess.id, {
                providerExternalId: providerState.providerExternalId,
                providerClientKey: providerState.providerClientKey,
                subscriptionUrl: providerState.subscriptionUrl,
                qrPayload: providerState.qrPayload,
                configPayload: providerState.configPayload,
                accessEndsAt: endsAt,
                idempotencyKey: input.operationKey,
            })
            await this.operationService.succeed(input.operationKey, { accessId: activeAccess.id })
        }

        return this.subscriptionRepository.save(subscription)
    }

    async adminConfigureSubscription(input: {
        subscriptionId: string
        planId: string
        operationKey: string
        endsAt?: Date
    }) {
        const subscription = await this.subscriptionRepository.findOneOrFail({
            where: { id: input.subscriptionId },
            relations: { user: true, plan: true },
        })

        const plan =
            subscription.planId === input.planId && subscription.plan
                ? subscription.plan
                : await this.planRepository.findOneOrFail({ where: { id: input.planId } })

        const now = new Date()
        const endsAt = input.endsAt && input.endsAt > now ? input.endsAt : new Date(now.getTime())
        if (!input.endsAt) {
            endsAt.setDate(endsAt.getDate() + plan.period)
        }

        subscription.planId = plan.id
        subscription.plan = plan
        subscription.status = StatusesEnum.ACTIVE
        subscription.startAt = now
        subscription.endsAt = endsAt
        subscription.nextPayAt = endsAt
        subscription.graceEndsAt = null
        subscription.accessDisabledAt = null
        subscription.isTrial = false
        subscription.trialEndsAt = null
        subscription.reminderState = {}

        const node = await this.serverNodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE)
        const hwidDeviceLimit = await this.getHwidDeviceLimit(plan.id)
        const access = await this.vpnAccessService.createOrGetActiveAccess({
            subscriptionId: subscription.id,
            userId: subscription.userId,
            providerType: VpnProviderTypeEnum.REMNAWAVE,
            serverNodeId: node.id,
            inboundKey: this.getNodeAccessKey(node),
            accessStartsAt: now,
            accessEndsAt: endsAt,
        })

        let providerState
        try {
            const providerUsername = this.resolveProviderUsername(access, subscription.user)
            providerState = await this.remnawaveProvider.ensureAccess({
                operationKey: input.operationKey,
                userKey: providerUsername,
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey || providerUsername,
                inboundKey: access.inboundKey,
                telegramId: subscription.user.telegramId,
                email: subscription.user.email,
                hwidDeviceLimit,
                expiresAt: endsAt,
                serverBaseUrl: node.baseUrl,
            })
        } catch (e: any) {
            await this.vpnAccessService.markError(access.id, e?.message || 'admin ensureAccess failed')
            throw e
        }

        await this.vpnAccessService.markProvisioned(access.id, {
            providerExternalId: providerState.providerExternalId,
            providerClientKey: providerState.providerClientKey,
            subscriptionUrl: providerState.subscriptionUrl,
            qrPayload: providerState.qrPayload,
            configPayload: providerState.configPayload,
            accessEndsAt: endsAt,
            idempotencyKey: input.operationKey,
        })

        subscription.lastProvisionedAt = new Date()
        return this.subscriptionRepository.save(subscription)
    }

    private getNodeAccessKey(node: { code: string; meta?: Record<string, any> }) {
        return String(node.meta?.defaultAccessKey || node.code)
    }

    private resolveProviderUsername(
        access: { providerClientKey?: string | null; providerExternalId?: string | null },
        user: User,
    ) {
        if (access.providerClientKey) {
            this.logger.log(`Provider username strategy=linked_provider_client_key user=${user.id}`)
            return access.providerClientKey
        }

        if (access.providerExternalId) {
            this.logger.log(`Provider username strategy=linked_provider_external_id user=${user.id}`)
            return this.buildLegacyProviderUsername(user.id)
        }

        const username = this.buildProviderUsername(user)
        this.logger.log(`Provider username strategy=local_user_scoped user=${user.id} username=${username}`)
        return username
    }

    private buildProviderUsername(user: User) {
        const telegramUsername = this.sanitizeProviderUsername(user.telegramUsername)
        const telegramId = this.getTelegramIdDigits(user.telegramId)
        const localSuffix = this.buildLocalIdSuffix(user.id)

        if (telegramUsername) {
            const base = telegramUsername.slice(0, PROVIDER_USERNAME_BASE_MAX_LENGTH)
            return this.limitProviderUsername(`${base}_${localSuffix}`)
        }

        if (telegramId) {
            return this.limitProviderUsername(`tg_${telegramId}_${localSuffix}`)
        }

        return this.limitProviderUsername(`u_${localSuffix}`)
    }

    private buildLegacyProviderUsername(userId: string) {
        return `u${userId.replace(/-/g, '').slice(0, 32)}`
    }

    private sanitizeProviderUsername(value?: string | null) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9_-]/g, '')
            .replace(/[_-]{2,}/g, '_')
            .replace(/^[_-]+|[_-]+$/g, '')
    }

    private getTelegramIdDigits(telegramId?: number | string | null) {
        return String(telegramId || '').replace(/\D/g, '')
    }

    private buildLocalIdSuffix(userId: string) {
        return (
            userId
                .replace(/[^a-z0-9]/gi, '')
                .toLowerCase()
                .slice(0, 12) || 'local'
        )
    }

    private limitProviderUsername(username: string) {
        const sanitized = this.sanitizeProviderUsername(username).slice(0, PROVIDER_USERNAME_MAX_LENGTH)
        return sanitized || 'user_local'
    }

    private async getHwidDeviceLimit(planId: string) {
        const limit = await this.billingService.getPlanLimitUnits(planId, VPN_DEVICE_SLOTS_METER_CODE)
        if (!limit || limit <= 0) {
            this.logger.warn(`Device limit not found for plan=${planId} meter=${VPN_DEVICE_SLOTS_METER_CODE}`)
            return undefined
        }

        return limit
    }

    private async restoreFailedTrialUsageIfNeeded(subscription: Subscription) {
        if (
            subscription.user?.hasUsedTrial &&
            subscription.status === StatusesEnum.PENDING &&
            !subscription.isTrial &&
            !subscription.trialEndsAt &&
            !subscription.lastProvisionedAt
        ) {
            this.logger.warn(
                `Restoring stale trial usage flag for user=${subscription.userId} subscription=${subscription.id}`,
            )
            subscription.user.hasUsedTrial = false
            subscription.user.trialUsedAt = null
            await this.userRepository.save(subscription.user)
        }
    }

    private async tryAutoRenewFromBonus(subscription: Subscription) {
        const planAmount = Number(subscription.plan?.amount || 0)
        if (!subscription.userId || !subscription.planId || planAmount <= 0) {
            return null
        }

        const user = subscription.user || (await this.userRepository.findOne({ where: { id: subscription.userId } }))
        if (!user) {
            return null
        }

        const walletBalance = Number(user.referralBonusBalanceRub || 0)
        if (walletBalance < planAmount) {
            return null
        }

        await this.paymentService.createBonusPayment(subscription, subscription.planId, { notifySuccess: false })

        const updatedUser = await this.userRepository.findOne({ where: { id: subscription.userId } })
        if (updatedUser?.telegramId) {
            await this.notificationService.notify(
                updatedUser.telegramId,
                [
                    `${tgEmoji('WALLET_NOTIFY_AUTO_RENEW')} Подписка автоматически продлена из бонусного кошелька.`,
                    '',
                    `Списано: ${this.formatMoney(planAmount)} ₽.`,
                    `Текущий баланс: ${this.formatMoney(updatedUser.referralBonusBalanceRub || 0)} ₽.`,
                ].join('\n'),
                { parse_mode: 'HTML' },
            )
        }

        return this.subscriptionRepository.findOne({
            where: { id: subscription.id },
            relations: { plan: true, user: true },
        })
    }

    private formatMoney(value: number) {
        return Number(value || 0).toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })
    }
}
