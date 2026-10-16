import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { PromoCode } from './promo-code.entity'
import { User } from '../../system/user/entity/user.entity'

export enum PromoUsageStatusEnum {
    RESERVED = 'RESERVED',
    APPLIED = 'APPLIED',
    CANCELED = 'CANCELED',
}

@Entity('promo_usage')
@Index('UQ_promo_usage_user_code', ['promoCodeId', 'userId'], { unique: true })
@Index('IDX_promo_usage_code_status_applied', ['promoCodeId', 'status', 'appliedAt'])
@Index('IDX_promo_usage_user_status', ['userId', 'status'])
export class PromoUsage extends BaseEntity {
    @ApiProperty()
    @Column({ name: 'promo_code_id', type: 'uuid' })
    promoCodeId: string

    @ManyToOne(() => PromoCode)
    @JoinColumn({ name: 'promo_code_id' })
    promoCode: PromoCode

    @ApiProperty()
    @Column({ name: 'user_id', type: 'uuid' })
    userId: string

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User

    @ApiProperty({ enum: PromoUsageStatusEnum })
    @Column({ type: 'enum', enum: PromoUsageStatusEnum, default: PromoUsageStatusEnum.RESERVED })
    status: PromoUsageStatusEnum

    @ApiProperty({ required: false })
    @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
    appliedAt?: Date
}
