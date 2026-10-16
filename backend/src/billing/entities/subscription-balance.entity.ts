import { ApiHideProperty, ApiProperty } from '@nestjs/swagger'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Meter } from './meter.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'

@Entity('subscription_balance')
export class SubscriptionBalance extends BaseEntity {
    @ApiHideProperty()
    @ManyToOne(() => Subscription, { eager: true })
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription

    @ApiProperty()
    @Column({ name: 'subscription_id', type: 'uuid' })
    subscriptionId: string

    @ApiHideProperty()
    @ManyToOne(() => Meter, { eager: true })
    @JoinColumn({ name: 'meter_id' })
    meter: Meter

    @ApiProperty()
    @Column({ name: 'meter_id', type: 'uuid' })
    meterId: string

    @ApiProperty()
    @Column({ name: 'used_units', type: 'int', default: 0 })
    usedUnits: number

    @ApiProperty()
    @Column({ name: 'period_start', type: 'timestamptz' })
    periodStart: Date

    @ApiProperty()
    @Column({ name: 'period_end', type: 'timestamptz' })
    periodEnd: Date

    @ApiHideProperty()
    @Column({ name: 'included_units', type: 'int', default: 0 })
    includedUnits: number
}
