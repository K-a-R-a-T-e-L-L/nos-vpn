import { ApiHideProperty, ApiProperty } from '@nestjs/swagger'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Meter } from './meter.entity'
import { UsageEvent } from './usage-event.entity'

@Entity('usage_line_item')
export class UsageLineItem extends BaseEntity {
    @ApiHideProperty()
    @ManyToOne(() => UsageEvent, (usageEvent) => usageEvent.lineItems, { eager: true })
    @JoinColumn({ name: 'usage_event_id' })
    usageEvent: UsageEvent

    @ApiProperty()
    @Column({ name: 'usage_event_id', type: 'uuid' })
    usageEventId: string

    @ApiHideProperty()
    @ManyToOne(() => Meter, { eager: true })
    @JoinColumn({ name: 'meter_id' })
    meter: Meter

    @ApiProperty()
    @Column({ name: 'meter_id', type: 'uuid' })
    meterId: string

    @ApiProperty()
    @Column({ type: 'int' })
    qty: number
}
