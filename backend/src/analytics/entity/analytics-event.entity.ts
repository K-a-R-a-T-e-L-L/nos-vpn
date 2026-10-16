import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { TrafficSource } from './traffic-source.entity'
import { User } from '../../system/user/entity/user.entity'

const decimalNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | number | null) => (value === null || value === undefined ? value : Number(value)),
}

@Entity('analytics_event')
@Index('IDX_analytics_event_type_occurred_at', ['eventType', 'occurredAt'])
@Index('IDX_analytics_event_user_id', ['userId'])
@Index('IDX_analytics_event_source_id', ['sourceId'])
export class AnalyticsEvent extends BaseEntity {
    @ApiProperty({ required: false })
    @Column({ name: 'user_id', type: 'uuid', nullable: true })
    userId?: string | null

    @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user?: User | null

    @ApiProperty({ required: false })
    @Column({ name: 'source_id', type: 'uuid', nullable: true })
    sourceId?: string | null

    @ManyToOne(() => TrafficSource, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'source_id' })
    source?: TrafficSource | null

    @ApiProperty()
    @Column({ name: 'event_type' })
    eventType: string

    @ApiProperty({ required: false })
    @Column({
        name: 'amount_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        nullable: true,
        transformer: decimalNumberTransformer,
    })
    amountRub?: number | null

    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    @Column({ type: 'jsonb', nullable: true })
    metadata?: Record<string, any> | null

    @ApiProperty()
    @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    occurredAt: Date
}
