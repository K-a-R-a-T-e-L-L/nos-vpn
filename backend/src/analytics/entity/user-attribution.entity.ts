import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { TrafficSource } from './traffic-source.entity'
import { User } from '../../system/user/entity/user.entity'

@Entity('user_attribution')
@Index('UQ_user_attribution_user_id', ['userId'], { unique: true })
@Index('IDX_user_attribution_source_id', ['sourceId'])
export class UserAttribution extends BaseEntity {
    @ApiProperty()
    @Column({ name: 'user_id', type: 'uuid' })
    userId: string

    @OneToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User

    @ApiProperty({ required: false })
    @Column({ name: 'source_id', type: 'uuid', nullable: true })
    sourceId?: string | null

    @ManyToOne(() => TrafficSource, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'source_id' })
    source?: TrafficSource | null

    @ApiProperty({ required: false })
    @Column({ name: 'source_code_snapshot', nullable: true })
    sourceCodeSnapshot?: string | null

    @ApiProperty({ required: false })
    @Column({ name: 'entry_point', nullable: true })
    entryPoint?: string | null

    @ApiProperty({ required: false })
    @Column({ name: 'landing_path', type: 'text', nullable: true })
    landingPath?: string | null

    @ApiProperty({ required: false })
    @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
    claimedAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'bot_started_at', type: 'timestamptz', nullable: true })
    botStartedAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'trial_started_at', type: 'timestamptz', nullable: true })
    trialStartedAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'access_viewed_at', type: 'timestamptz', nullable: true })
    accessViewedAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'qr_opened_at', type: 'timestamptz', nullable: true })
    qrOpenedAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'first_payment_at', type: 'timestamptz', nullable: true })
    firstPaymentAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'first_post_trial_payment_at', type: 'timestamptz', nullable: true })
    firstPostTrialPaymentAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'first_plan_id', type: 'uuid', nullable: true })
    firstPlanId?: string | null

    @ApiProperty({ required: false })
    @Column({ name: 'latest_plan_id', type: 'uuid', nullable: true })
    latestPlanId?: string | null
}
