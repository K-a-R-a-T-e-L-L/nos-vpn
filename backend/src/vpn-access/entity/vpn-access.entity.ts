import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Subscription } from '../../subscription/entity/subscription.entity'
import { User } from '../../system/user/entity/user.entity'
import { ServerNode } from '../../vpn-provider/entity/server-node.entity'
import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'
import { VpnAccessStatusEnum } from '../enum/vpn-access-status.enum'

@Entity('vpn_access')
@Index('IDX_vpn_access_subscription_status', ['subscriptionId', 'status'])
@Index('IDX_vpn_access_user_status', ['userId', 'status'])
@Index('UQ_vpn_access_active_scope', ['subscriptionId', 'providerType', 'serverNodeId', 'inboundKey'], {
    unique: true,
    where: `"status" IN ('PENDING', 'ACTIVE', 'GRACE')`,
})
export class VpnAccess extends BaseEntity {
    @ApiProperty()
    @Column({ name: 'subscription_id', type: 'uuid' })
    subscriptionId: string

    @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription

    @ApiProperty()
    @Column({ name: 'user_id', type: 'uuid' })
    userId: string

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User

    @ApiProperty({ enum: VpnProviderTypeEnum })
    @Column({ name: 'provider_type', type: 'enum', enum: VpnProviderTypeEnum })
    providerType: VpnProviderTypeEnum

    @ApiProperty()
    @Column({ name: 'server_node_id', type: 'uuid' })
    serverNodeId: string

    @ManyToOne(() => ServerNode)
    @JoinColumn({ name: 'server_node_id' })
    serverNode: ServerNode

    @ApiProperty()
    @Column({ name: 'inbound_key' })
    inboundKey: string

    @ApiProperty({ enum: VpnAccessStatusEnum })
    @Column({ type: 'enum', enum: VpnAccessStatusEnum, default: VpnAccessStatusEnum.PENDING })
    status: VpnAccessStatusEnum

    @ApiProperty({ required: false })
    @Column({ name: 'provider_external_id', nullable: true })
    providerExternalId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'provider_client_key', nullable: true })
    providerClientKey?: string

    @ApiProperty({ required: false })
    @Column({ name: 'subscription_url', type: 'text', nullable: true })
    subscriptionUrl?: string

    @ApiProperty({ required: false })
    @Column({ name: 'qr_payload', type: 'text', nullable: true })
    qrPayload?: string

    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    @Column({ name: 'config_payload', type: 'jsonb', nullable: true })
    configPayload?: Record<string, any>

    @ApiProperty()
    @Column({ name: 'access_starts_at', type: 'timestamptz' })
    accessStartsAt: Date

    @ApiProperty()
    @Column({ name: 'access_ends_at', type: 'timestamptz' })
    accessEndsAt: Date

    @ApiProperty({ required: false })
    @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
    disabledAt?: Date

    @ApiProperty({ required: false })
    @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
    lastSyncedAt?: Date

    @ApiProperty({ required: false })
    @Column({ name: 'last_sync_status', nullable: true })
    lastSyncStatus?: string

    @ApiProperty({ required: false })
    @Column({ name: 'last_sync_error', type: 'text', nullable: true })
    lastSyncError?: string

    @ApiProperty()
    @Column({ default: 1 })
    version: number

    @ApiProperty({ required: false })
    @Column({ name: 'idempotency_key_last', nullable: true })
    idempotencyKeyLast?: string

    @ApiProperty()
    @Column({ name: 'retry_count', type: 'int', default: 0 })
    retryCount: number

    @ApiProperty({ required: false })
    @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
    nextRetryAt?: Date
}
