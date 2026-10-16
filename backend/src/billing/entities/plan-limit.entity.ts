import { ApiHideProperty, ApiProperty } from '@nestjs/swagger'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Meter } from './meter.entity'
import { Plan } from '../../plan/entity/plan.entity'

@Entity('plan_limit')
export class PlanLimit extends BaseEntity {
    @ApiHideProperty()
    @ManyToOne(() => Plan, { eager: true })
    @JoinColumn({ name: 'plan_id' })
    plan: Plan

    @ApiProperty()
    @Column({ name: 'plan_id', type: 'uuid' })
    planId: string

    @ApiHideProperty()
    @ManyToOne(() => Meter, { eager: true })
    @JoinColumn({ name: 'meter_id' })
    meter: Meter

    @ApiProperty()
    @Column({ name: 'meter_id', type: 'uuid' })
    meterId: string

    @ApiProperty()
    @Column({ name: 'included_units', type: 'int' })
    includedUnits: number

    @ApiHideProperty()
    @Column({ name: 'overage_allowed', default: false })
    overageAllowed: boolean
}
