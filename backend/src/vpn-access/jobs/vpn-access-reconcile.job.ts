import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Subscription } from '../../subscription/entity/subscription.entity'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { RemnawaveProviderAdapter } from '../../vpn-provider/adapters/remnawave-provider.adapter'
import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'
import { ServerNodeResolverService } from '../../vpn-provider/services/server-node-resolver.service'
import { AccessOperationTypeEnum } from '../operations/access-operation-log.entity'
import { AccessOperationService } from '../operations/access-operation.service'
import { VpnAccessService } from '../services/vpn-access.service'

@Injectable()
export class VpnAccessReconcileJob {
    constructor(
        private readonly vpnAccessService: VpnAccessService,
        private readonly provider: RemnawaveProviderAdapter,
        private readonly nodeResolver: ServerNodeResolverService,
        private readonly operationService: AccessOperationService,
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
    ) {}

    @Cron(CronExpression.EVERY_30_MINUTES)
    async run() {
        const candidates = await this.vpnAccessService.listForReconcile(100)

        for (const access of candidates) {
            const operationKey = `reconcile-${access.id}-${Math.floor(Date.now() / (30 * 60 * 1000))}`
            const op = await this.operationService.begin({
                operationKey,
                operationType: AccessOperationTypeEnum.RECONCILE,
                subscriptionId: access.subscriptionId,
                accessId: access.id,
                providerType: VpnProviderTypeEnum.REMNAWAVE,
            })
            if (!op.isNew && op.existing.status === 'SUCCESS') {
                continue
            }

            try {
                const sub = await this.subscriptionRepository.findOne({ where: { id: access.subscriptionId } })
                if (!sub) {
                    await this.vpnAccessService.markError(access.id, 'Subscription missing')
                    await this.operationService.fail(operationKey, 'Subscription missing')
                    continue
                }

                const node = await this.nodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE, access.serverNodeId)
                const state = await this.provider.getAccessState({
                    inboundKey: access.inboundKey,
                    providerExternalId: access.providerExternalId,
                    providerClientKey: access.providerClientKey,
                    serverBaseUrl: node.baseUrl,
                })

                if ([StatusesEnum.STOPPED, StatusesEnum.EXPIRED].includes(sub.status) && state.isActive) {
                    await this.provider.disableAccess({
                        operationKey: `reconcile-disable-${access.id}-${Date.now()}`,
                        inboundKey: access.inboundKey,
                        providerExternalId: access.providerExternalId,
                        providerClientKey: access.providerClientKey,
                        serverBaseUrl: node.baseUrl,
                    })
                    await this.vpnAccessService.markDisabled(access.id, 'Reconcile disabled stale provider access')
                    await this.operationService.succeed(operationKey, { disabled: true })
                    continue
                }

                if ([StatusesEnum.ACTIVE, StatusesEnum.GRACE].includes(sub.status)) {
                    // Conservative policy: do not auto-recreate missing provider access, mark drift/error instead.
                    if (!state.providerExternalId) {
                        await this.vpnAccessService.markError(access.id, 'Provider client missing (drift)')
                        await this.operationService.fail(operationKey, 'Provider client missing (drift)')
                        continue
                    }

                    if (!state.isActive) {
                        await this.vpnAccessService.markError(
                            access.id,
                            'Provider client disabled while backend expects active (drift)',
                        )
                        await this.operationService.fail(
                            operationKey,
                            'Provider client disabled while backend expects active (drift)',
                        )
                        continue
                    }

                    await this.vpnAccessService.markProvisioned(access.id, {
                        providerExternalId: state.providerExternalId,
                        providerClientKey: state.providerClientKey,
                        subscriptionUrl: state.subscriptionUrl,
                        qrPayload: state.qrPayload,
                        configPayload: state.configPayload,
                        accessEndsAt: state.expiresAt || access.accessEndsAt,
                        idempotencyKey: operationKey,
                    })
                    await this.operationService.succeed(operationKey, { synced: true })
                } else {
                    await this.operationService.succeed(operationKey, { skipped: true, reason: 'status_not_managed' })
                }
            } catch (e: any) {
                await this.vpnAccessService.markError(access.id, e?.message || 'Reconcile failed')
                await this.operationService.fail(operationKey, e?.message || 'Reconcile failed')
            }
        }
    }
}
