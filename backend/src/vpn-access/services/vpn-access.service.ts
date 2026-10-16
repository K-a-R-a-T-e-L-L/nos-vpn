import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { LessThanOrEqual } from 'typeorm'

import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'
import { VpnAccess } from '../entity/vpn-access.entity'
import { VpnAccessStatusEnum } from '../enum/vpn-access-status.enum'

@Injectable()
export class VpnAccessService {
    private static readonly MAX_RETRY_COUNT = 8

    constructor(
        @InjectRepository(VpnAccess)
        private readonly vpnAccessRepository: Repository<VpnAccess>,
    ) {}

    async createOrGetActiveAccess(input: {
        subscriptionId: string
        userId: string
        providerType: VpnProviderTypeEnum
        serverNodeId: string
        inboundKey: string
        accessStartsAt: Date
        accessEndsAt: Date
    }) {
        const existing = await this.vpnAccessRepository.findOne({
            where: {
                subscriptionId: input.subscriptionId,
                providerType: input.providerType,
                serverNodeId: input.serverNodeId,
                inboundKey: input.inboundKey,
                status: In([VpnAccessStatusEnum.PENDING, VpnAccessStatusEnum.ACTIVE, VpnAccessStatusEnum.GRACE]) as any,
            },
        })

        if (existing) {
            return existing
        }

        return this.vpnAccessRepository.save({
            subscriptionId: input.subscriptionId,
            userId: input.userId,
            providerType: input.providerType,
            serverNodeId: input.serverNodeId,
            inboundKey: input.inboundKey,
            status: VpnAccessStatusEnum.PENDING,
            accessStartsAt: input.accessStartsAt,
            accessEndsAt: input.accessEndsAt,
            version: 1,
        })
    }

    async markProvisioned(
        id: string,
        data: {
            providerExternalId?: string
            providerClientKey?: string
            subscriptionUrl?: string
            qrPayload?: string
            configPayload?: Record<string, any>
            accessEndsAt?: Date
            idempotencyKey?: string
        },
    ) {
        const access = await this.vpnAccessRepository.findOneOrFail({ where: { id } })
        access.status = VpnAccessStatusEnum.ACTIVE
        access.providerExternalId = data.providerExternalId || access.providerExternalId
        access.providerClientKey = data.providerClientKey || access.providerClientKey
        access.subscriptionUrl = data.subscriptionUrl || access.subscriptionUrl
        access.qrPayload = data.qrPayload || access.qrPayload
        access.configPayload = data.configPayload || access.configPayload
        access.accessEndsAt = data.accessEndsAt || access.accessEndsAt
        access.lastSyncedAt = new Date()
        access.lastSyncStatus = 'SYNCED'
        access.lastSyncError = null
        access.idempotencyKeyLast = data.idempotencyKey || access.idempotencyKeyLast
        access.version += 1
        return this.vpnAccessRepository.save(access)
    }

    async markDisabled(id: string, reason?: string) {
        const access = await this.vpnAccessRepository.findOneOrFail({ where: { id } })
        access.status = VpnAccessStatusEnum.DISABLED
        access.disabledAt = new Date()
        access.lastSyncedAt = new Date()
        access.lastSyncStatus = 'DISABLED'
        access.lastSyncError = reason || null
        access.version += 1
        return this.vpnAccessRepository.save(access)
    }

    async markGrace(id: string) {
        const access = await this.vpnAccessRepository.findOneOrFail({ where: { id } })
        access.status = VpnAccessStatusEnum.GRACE
        access.lastSyncedAt = new Date()
        access.lastSyncStatus = 'GRACE'
        access.lastSyncError = null
        access.version += 1
        return this.vpnAccessRepository.save(access)
    }

    async markError(id: string, errorMessage: string) {
        const access = await this.vpnAccessRepository.findOneOrFail({ where: { id } })
        const nextRetryCount = (access.retryCount || 0) + 1
        if (nextRetryCount > VpnAccessService.MAX_RETRY_COUNT) {
            access.status = VpnAccessStatusEnum.ARCHIVED
            access.lastSyncedAt = new Date()
            access.lastSyncStatus = 'ERROR_MAX_RETRIES_EXCEEDED'
            access.lastSyncError = errorMessage
            access.retryCount = nextRetryCount
            access.nextRetryAt = null
            access.version += 1
            return this.vpnAccessRepository.save(access)
        }

        access.status = VpnAccessStatusEnum.ERROR
        access.lastSyncedAt = new Date()
        access.lastSyncStatus = 'ERROR'
        access.lastSyncError = errorMessage
        access.retryCount = nextRetryCount
        const retryAt = new Date()
        retryAt.setMinutes(retryAt.getMinutes() + Math.min(60, access.retryCount * 5))
        access.nextRetryAt = retryAt
        access.version += 1
        return this.vpnAccessRepository.save(access)
    }

    async findActiveBySubscription(subscriptionId: string) {
        return this.vpnAccessRepository.findOne({
            where: {
                subscriptionId,
                status: In([VpnAccessStatusEnum.ACTIVE, VpnAccessStatusEnum.GRACE]) as any,
            },
            order: { createdAt: 'DESC' },
        })
    }

    async findProvisionableBySubscription(subscriptionId: string) {
        return this.vpnAccessRepository.findOne({
            where: {
                subscriptionId,
                status: In([
                    VpnAccessStatusEnum.PENDING,
                    VpnAccessStatusEnum.ACTIVE,
                    VpnAccessStatusEnum.GRACE,
                    VpnAccessStatusEnum.ERROR,
                ]) as any,
            },
            order: { createdAt: 'DESC' },
        })
    }

    async listForReconcile(limit = 100) {
        const now = new Date()
        return this.vpnAccessRepository.find({
            where: [
                { status: In([VpnAccessStatusEnum.ACTIVE, VpnAccessStatusEnum.GRACE]) as any },
                { status: VpnAccessStatusEnum.ERROR as any, nextRetryAt: LessThanOrEqual(now) as any },
            ],
            order: { updatedAt: 'ASC' },
            take: limit,
        })
    }
}
