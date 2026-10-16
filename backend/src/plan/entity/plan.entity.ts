import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

@Entity('plans')
export class Plan extends BaseEntity {
    @ApiProperty({ required: false })
    @Column({ nullable: true, unique: true })
    code?: string

    @ApiProperty({ required: false })
    @Column({ nullable: true })
    title?: string

    @ApiProperty({ required: false })
    @Column({ nullable: true })
    description?: string

    @ApiProperty()
    @Column()
    name: string

    @ApiProperty()
    @Column()
    period: number

    @ApiProperty()
    @Column()
    amount: number

    @ApiProperty({ required: false, nullable: true })
    @Column({ name: 'devices_limit', type: 'int', nullable: true })
    devicesLimit?: number | null

    @ApiProperty()
    @Column({ name: 'is_active', default: true })
    isActive: boolean
}
