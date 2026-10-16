import { ApiHideProperty, ApiProperty } from '@nestjs/swagger'
import { Column, Entity, OneToMany } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { PlanLimit } from './plan-limit.entity'
import { SubscriptionBalance } from './subscription-balance.entity'
import { UsageLineItem } from './usage-line-item.entity'

@Entity('meter')
export class Meter extends BaseEntity {
    @ApiProperty()
    @Column({ unique: true })
    code: string

    @ApiProperty()
    @Column()
    name: string

    @ApiProperty({ required: false })
    @Column({ nullable: true })
    unit?: string

    @ApiProperty()
    @Column({ name: 'is_active', default: true })
    isActive: boolean

    @ApiProperty({ required: false })
    @Column({ type: 'text', nullable: true })
    description?: string

    @ApiHideProperty()
    @OneToMany(() => PlanLimit, (planLimit) => planLimit.meter)
    planLimits: PlanLimit[]

    @ApiHideProperty()
    @OneToMany(() => SubscriptionBalance, (balance) => balance.meter)
    balances: SubscriptionBalance[]

    @ApiHideProperty()
    @OneToMany(() => UsageLineItem, (lineItem) => lineItem.meter)
    usageLineItems: UsageLineItem[]
}
