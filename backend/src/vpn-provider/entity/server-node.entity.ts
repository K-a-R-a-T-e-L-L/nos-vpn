import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'

@Entity('server_node')
export class ServerNode extends BaseEntity {
    @ApiProperty()
    @Column({ unique: true })
    code: string

    @ApiProperty()
    @Column()
    name: string

    @ApiProperty()
    @Column()
    region: string

    @ApiProperty({ enum: VpnProviderTypeEnum })
    @Column({ name: 'provider_type', type: 'enum', enum: VpnProviderTypeEnum })
    providerType: VpnProviderTypeEnum

    @ApiProperty()
    @Column({ name: 'base_url' })
    baseUrl: string

    @ApiProperty()
    @Column({ name: 'is_active', default: true })
    isActive: boolean

    @ApiProperty()
    @Column({ default: 100 })
    priority: number

    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    @Column({ type: 'jsonb', nullable: true })
    meta?: Record<string, any>
}
