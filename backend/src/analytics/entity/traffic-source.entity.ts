import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

@Entity('traffic_source')
@Index('UQ_traffic_source_code', ['code'], { unique: true })
export class TrafficSource extends BaseEntity {
    @ApiProperty()
    @Column()
    code: string

    @ApiProperty()
    @Column()
    name: string

    @ApiProperty({ required: false })
    @Column({ type: 'text', nullable: true })
    description?: string | null

    @ApiProperty({ required: false })
    @Column({ name: 'website_path', default: '/earn' })
    websitePath: string

    @ApiProperty()
    @Column({ name: 'is_active', default: true })
    isActive: boolean
}
