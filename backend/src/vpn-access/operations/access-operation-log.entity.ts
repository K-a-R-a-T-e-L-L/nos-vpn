import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'

export enum AccessOperationTypeEnum {
    ENSURE = 'ENSURE',
    EXTEND = 'EXTEND',
    DISABLE = 'DISABLE',
    RECONCILE = 'RECONCILE',
}

export enum AccessOperationStatusEnum {
    STARTED = 'STARTED',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

@Entity('access_operation_log')
@Index('UQ_access_operation_key', ['operationKey'], { unique: true })
export class AccessOperationLog extends BaseEntity {
    @ApiProperty()
    @Column({ name: 'operation_key' })
    operationKey: string

    @ApiProperty({ enum: AccessOperationTypeEnum })
    @Column({ name: 'operation_type', type: 'enum', enum: AccessOperationTypeEnum })
    operationType: AccessOperationTypeEnum

    @ApiProperty({ required: false })
    @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
    subscriptionId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'access_id', type: 'uuid', nullable: true })
    accessId?: string

    @ApiProperty({ enum: VpnProviderTypeEnum })
    @Column({ name: 'provider_type', type: 'enum', enum: VpnProviderTypeEnum })
    providerType: VpnProviderTypeEnum

    @ApiProperty({ enum: AccessOperationStatusEnum })
    @Column({ type: 'enum', enum: AccessOperationStatusEnum, default: AccessOperationStatusEnum.STARTED })
    status: AccessOperationStatusEnum

    @ApiProperty({ required: false })
    @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
    startedAt?: Date

    @ApiProperty({ required: false })
    @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
    finishedAt?: Date

    @ApiProperty({ required: false })
    @Column({ type: 'text', nullable: true })
    error?: string

    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    @Column({ name: 'result_snapshot', type: 'jsonb', nullable: true })
    resultSnapshot?: Record<string, any>
}
