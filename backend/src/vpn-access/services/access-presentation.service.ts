import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { VpnAccessService } from './vpn-access.service'
import { BillingService } from '../../billing/billing.service'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { RemnawaveProviderAdapter } from '../../vpn-provider/adapters/remnawave-provider.adapter'
import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'
import { ServerNodeResolverService } from '../../vpn-provider/services/server-node-resolver.service'

const VPN_DEVICE_SLOTS_METER_CODE = 'vpn_device_slots'
const PROVIDER_USERNAME_MAX_LENGTH = 36
const PROVIDER_USERNAME_BASE_MAX_LENGTH = 20

@Injectable()
export class AccessPresentationService {
    private readonly logger = new Logger(AccessPresentationService.name)

    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        private readonly vpnAccessService: VpnAccessService,
        private readonly configService: ConfigService,
        private readonly provider: RemnawaveProviderAdapter,
        private readonly nodeResolver: ServerNodeResolverService,
        private readonly billingService: BillingService,
    ) {}

    async buildPayload(subscriptionId: string, subscriptionOverride?: Subscription | null) {
        const subscription =
            subscriptionOverride ||
            (await this.subscriptionRepository.findOne({
                where: { id: subscriptionId },
                relations: { plan: true, user: true },
            }))

        if (!subscription || !this.canExposeAccess(subscription)) {
            return null
        }

        let access = await this.vpnAccessService.findActiveBySubscription(subscriptionId)
        let resolvedSubscriptionUrl = this.resolveSubscriptionUrl(access)
        let resolvedQrPayload = access?.qrPayload || resolvedSubscriptionUrl || null

        if (!access || !resolvedSubscriptionUrl) {
            access = await this.tryRepairAccess(subscription, access)
            resolvedSubscriptionUrl = this.resolveSubscriptionUrl(access)
            resolvedQrPayload = access?.qrPayload || resolvedSubscriptionUrl || null
        }

        if (access) {
            await this.trySyncAccessContacts(subscription.user, access)
            access = await this.tryRefreshAccessFromProvider(access)
            resolvedSubscriptionUrl = this.resolveSubscriptionUrl(access)
            resolvedQrPayload = access?.qrPayload || resolvedSubscriptionUrl || null
        }

        const hasUrl = Boolean(resolvedSubscriptionUrl)
        const hasQr = Boolean(resolvedQrPayload)
        const hasRaw = Boolean(access?.configPayload)
        const deliveryMode = hasUrl || hasQr ? 'DIRECT_URL' : hasRaw ? 'RAW_CONFIG_ONLY' : 'UNAVAILABLE'

        this.logger.log(
            [
                'buildPayload access decision:',
                `subscriptionId=${subscriptionId}`,
                `subscriptionStatus=${subscription.status}`,
                `accessFound=${Boolean(access)}`,
                `accessId=${access?.id || '-'}`,
                `accessStatus=${access?.status || '-'}`,
                `access.subscriptionUrl=${this.safeLogValue(access?.subscriptionUrl)}`,
                `access.qrPayload=${this.safeLogValue(access?.qrPayload)}`,
                `access.configPayload=${access?.configPayload ? 'present' : 'empty'}`,
                `resolvedSubscriptionUrl=${this.safeLogValue(resolvedSubscriptionUrl)}`,
                `resolvedQrPayload=${this.safeLogValue(resolvedQrPayload)}`,
                `deliveryMode=${deliveryMode}`,
                `reason=${this.getDeliveryModeReason(Boolean(access), hasUrl, hasQr, hasRaw)}`,
            ].join(' '),
        )

        return {
            status: subscription.status,
            plan: subscription.plan?.title || subscription.plan?.name,
            planCode: subscription.plan?.code || null,
            planTitle: subscription.plan?.title || subscription.plan?.name || null,
            planDescription: subscription.plan?.description || null,
            expiresAt: subscription.status === StatusesEnum.GRACE ? subscription.graceEndsAt : subscription.endsAt,
            graceEndsAt: subscription.graceEndsAt,
            subscriptionUrl: resolvedSubscriptionUrl,
            qrPayload: resolvedQrPayload,
            rawConfig:
                deliveryMode === 'RAW_CONFIG_ONLY'
                    ? {
                          providerExternalId: access?.providerExternalId || null,
                          providerClientKey: access?.providerClientKey || null,
                          inboundKey: access?.inboundKey || null,
                          configPayload: access?.configPayload || null,
                      }
                    : null,
            deliveryMode,
            instructions:
                deliveryMode === 'DIRECT_URL'
                    ? 'Откройте ссылку подписки: там будут инструкция и список совместимых клиентов. Для быстрого старта рекомендуем Happ.'
                    : deliveryMode === 'RAW_CONFIG_ONLY'
                      ? 'Ссылка подписки пока недоступна. Напишите в поддержку — поможем подключиться вручную.'
                      : 'Данные доступа пока недоступны. Обратитесь в поддержку.',
        }
    }

    private canExposeAccess(subscription: Subscription) {
        if (subscription.status === StatusesEnum.ACTIVE) {
            return true
        }

        if (subscription.status !== StatusesEnum.GRACE || !subscription.graceEndsAt) {
            return false
        }

        return subscription.graceEndsAt > new Date()
    }

    private async tryRepairAccess(subscription: Subscription, existingAccess: any) {
        try {
            const node = await this.nodeResolver.resolveNode(
                VpnProviderTypeEnum.REMNAWAVE,
                existingAccess?.serverNodeId,
            )
            const access =
                existingAccess ||
                (await this.vpnAccessService.findProvisionableBySubscription(subscription.id)) ||
                (await this.vpnAccessService.createOrGetActiveAccess({
                    subscriptionId: subscription.id,
                    userId: subscription.userId,
                    providerType: VpnProviderTypeEnum.REMNAWAVE,
                    serverNodeId: node.id,
                    inboundKey: this.getNodeAccessKey(node),
                    accessStartsAt: subscription.startAt || new Date(),
                    accessEndsAt:
                        subscription.status === StatusesEnum.GRACE ? subscription.graceEndsAt! : subscription.endsAt,
                }))

            const providerUsername = this.resolveProviderUsername(access, subscription.user)
            const state = await this.provider.ensureAccess({
                operationKey: `presentation-repair-${subscription.id}-${Date.now()}`,
                userKey: providerUsername,
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey || providerUsername,
                inboundKey: access.inboundKey || this.getNodeAccessKey(node),
                telegramId: subscription.user?.telegramId,
                email: subscription.user?.email,
                hwidDeviceLimit: await this.getHwidDeviceLimit(subscription.planId),
                expiresAt: subscription.status === StatusesEnum.GRACE ? subscription.graceEndsAt! : subscription.endsAt,
                serverBaseUrl: node.baseUrl,
            })

            await this.vpnAccessService.markProvisioned(access.id, {
                providerExternalId: state.providerExternalId,
                providerClientKey: state.providerClientKey,
                subscriptionUrl: state.subscriptionUrl,
                qrPayload: state.qrPayload,
                configPayload: state.configPayload,
                accessEndsAt: state.expiresAt || access.accessEndsAt,
                idempotencyKey: `presentation-repair-${access.id}`,
            })

            this.logger.log(`repairAccess success: subscriptionId=${subscription.id} accessId=${access.id}`)
            return this.vpnAccessService.findActiveBySubscription(subscription.id)
        } catch (error: any) {
            this.logger.warn(
                `repairAccess failed: subscriptionId=${subscription?.id || '-'} message=${error?.message || 'unknown'}`,
            )
            if (existingAccess?.id) {
                await this.vpnAccessService.markError(existingAccess.id, error?.message || 'repairAccess failed')
            }
            return existingAccess
        }
    }

    private resolveSubscriptionUrl(access: any) {
        const publicBaseUrl = String(
            this.configService.get<string>('REMNAWAVE_SUBSCRIPTION_PUBLIC_BASE_URL') || '',
        ).replace(/\/$/, '')
        const shortUuid = access?.configPayload?.shortUuid || access?.configPayload?.short_uuid
        if (publicBaseUrl && shortUuid) {
            return `${publicBaseUrl}/${shortUuid}`
        }

        const direct =
            access?.subscriptionUrl ||
            access?.configPayload?.subscriptionUrl ||
            access?.configPayload?.subscription_url ||
            access?.configPayload?.subUrl ||
            access?.configPayload?.sub_url ||
            access?.configPayload?.links?.subscription ||
            access?.configPayload?.subscription?.url

        if (direct) {
            return String(direct)
        }

        return null
    }

    private async tryRefreshAccessFromProvider(access: any) {
        try {
            const node = await this.nodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE, access.serverNodeId)
            const state = await this.provider.getAccessState({
                inboundKey: access.inboundKey,
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey,
                serverBaseUrl: node.baseUrl,
            })

            if (!state?.providerExternalId || !state.isActive) {
                this.logger.warn(
                    `refreshAccessFromProvider skipped: accessId=${access.id} providerExternalId=${state?.providerExternalId || '-'} isActive=${String(state?.isActive)}`,
                )
                return access
            }

            await this.vpnAccessService.markProvisioned(access.id, {
                providerExternalId: state.providerExternalId,
                providerClientKey: state.providerClientKey,
                subscriptionUrl: state.subscriptionUrl,
                qrPayload: state.qrPayload,
                configPayload: state.configPayload,
                accessEndsAt: state.expiresAt || access.accessEndsAt,
                idempotencyKey: `presentation-refresh-${access.id}`,
            })

            this.logger.log(`refreshAccessFromProvider success: accessId=${access.id}`)
            return this.vpnAccessService.findActiveBySubscription(access.subscriptionId)
        } catch (error: any) {
            this.logger.warn(
                `refreshAccessFromProvider failed: accessId=${access?.id || '-'} message=${error?.message || 'unknown'}`,
            )
            return access
        }
    }

    private async trySyncAccessContacts(user: any, access: any) {
        if (!user || (!user.telegramId && !user.email)) {
            return
        }

        try {
            const node = await this.nodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE, access.serverNodeId)
            await this.provider.updateUserContacts({
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey,
                telegramId: user.telegramId,
                email: user.email,
                serverBaseUrl: node.baseUrl,
            })
        } catch (error: any) {
            this.logger.warn(
                `syncAccessContacts failed: accessId=${access?.id || '-'} userId=${user?.id || '-'} message=${error?.message || 'unknown'}`,
            )
        }
    }

    private getNodeAccessKey(node: { code: string; meta?: Record<string, any> }) {
        return String(node.meta?.defaultAccessKey || node.code)
    }

    private resolveProviderUsername(
        access: { providerClientKey?: string | null; providerExternalId?: string | null },
        user: any,
    ) {
        if (access.providerClientKey) {
            return access.providerClientKey
        }

        if (access.providerExternalId) {
            return this.buildLegacyProviderUsername(user.id)
        }

        return this.buildProviderUsername(user)
    }

    private buildProviderUsername(user: any) {
        const telegramUsername = this.sanitizeProviderUsername(user?.telegramUsername)
        const telegramId = this.getTelegramIdDigits(user?.telegramId)
        const localSuffix = this.buildLocalIdSuffix(user?.id)

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
        return `u${String(userId || '')
            .replace(/-/g, '')
            .slice(0, 32)}`
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

    private buildLocalIdSuffix(userId?: string | null) {
        return (
            String(userId || '')
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

    private getDeliveryModeReason(accessFound: boolean, hasUrl: boolean, hasQr: boolean, hasRaw: boolean) {
        if (!accessFound) {
            return 'access_not_found'
        }

        if (hasUrl || hasQr) {
            return 'subscription_url_or_qr_available'
        }

        if (hasRaw) {
            return 'raw_config_only_without_url'
        }

        return 'access_without_delivery_payload'
    }

    private safeLogValue(value?: string | null) {
        if (!value) {
            return '-'
        }
        return '[redacted]'
    }
}
