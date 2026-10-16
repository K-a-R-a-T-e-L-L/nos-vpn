import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { PromoStatusEnum, PromoTypeEnum } from './promo.enum'

@Entity('promo_code')
export class PromoCode extends BaseEntity {
    @ApiProperty()
    @Column({ unique: true })
    code: string

    @ApiProperty()
    @Column({ default: '' })
    name: string

    @ApiProperty({ enum: PromoTypeEnum })
    @Column({ type: 'enum', enum: PromoTypeEnum, default: PromoTypeEnum.FIRST_PAYMENT_PERCENT })
    type: PromoTypeEnum

    @ApiProperty()
    @Column({ name: 'value_percent', type: 'int' })
    valuePercent: number

    @ApiProperty({ enum: PromoStatusEnum })
    @Column({ type: 'enum', enum: PromoStatusEnum, default: PromoStatusEnum.ACTIVE })
    status: PromoStatusEnum

    @ApiProperty({ required: false })
    @Column({ name: 'max_uses', type: 'int', nullable: true })
    maxUses?: number | null

    @ApiProperty()
    @Column({ name: 'duration_days', type: 'int', default: 30 })
    durationDays: number

    @ApiProperty()
    @Column({ name: 'devices_limit', type: 'int', default: 1 })
    devicesLimit: number

    @ApiProperty({ required: false })
    @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
    startsAt?: Date | null

    @ApiProperty()
    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date
}
