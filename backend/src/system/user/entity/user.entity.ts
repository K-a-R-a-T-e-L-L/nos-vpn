import { ApiHideProperty, ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { Subscription } from '../../../subscription/entity/subscription.entity'
import { RolesEnum } from '../enum/roles.enum'

const decimalNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | number | null) => (value === null || value === undefined ? value : Number(value)),
}

@Entity('users')
@Index('UQ_users_email', ['email'], { unique: true, where: '"email" IS NOT NULL' })
@Index('IDX_users_created_id', ['createdAt', 'id'])
@Index('IDX_users_role_created', ['role', 'createdAt'])
@Index('IDX_users_blocked_created', ['isBlocked', 'createdAt'])
@Index('IDX_users_referred_created', ['referredByUserId', 'createdAt'])
export class User extends BaseEntity {
    @ApiProperty({ required: false })
    @Column({ nullable: true })
    email?: string

    @ApiHideProperty()
    @Column({ name: 'password_hash', nullable: true, select: false })
    passwordHash?: string

    @ApiProperty({ required: false })
    @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
    emailVerifiedAt?: Date

    @ApiProperty()
    @Column({ name: 'has_temporary_web_credentials', default: false })
    hasTemporaryWebCredentials: boolean

    @ApiProperty()
    @Column({ name: 'telegram_id', type: 'bigint', nullable: true, unique: true })
    telegramId?: number

    @ApiProperty()
    @Column({ name: 'telegram_username', nullable: true })
    telegramUsername?: string

    @ApiProperty()
    @Column({ name: 'telegram_first_name', nullable: true })
    telegramFirstName?: string

    @ApiProperty()
    @Column({ name: 'telegram_last_name', nullable: true })
    telegramLastName?: string

    @ApiProperty()
    @Column({ name: 'telegram_is_premium', nullable: true })
    telegramIsPremium?: boolean

    @ApiProperty()
    @Column({ name: 'telegram_language_code', nullable: true })
    telegramLanguageCode?: string

    @ApiProperty()
    @Column({ name: 'is_blocked', default: false })
    isBlocked: boolean

    @ApiProperty({ required: false })
    @Column({ name: 'blocked_at', type: 'timestamptz', nullable: true })
    blockedAt?: Date

    @ApiProperty({ required: false })
    @Column({ name: 'telegram_linked_at', type: 'timestamptz', nullable: true })
    telegramLinkedAt?: Date

    @ApiHideProperty()
    @Column({ name: 'telegram_link_token_hash', nullable: true, select: false })
    telegramLinkTokenHash?: string

    @ApiHideProperty()
    @Column({ name: 'telegram_link_token_expires_at', type: 'timestamptz', nullable: true })
    telegramLinkTokenExpiresAt?: Date

    @Column({ type: 'enum', enum: RolesEnum, default: RolesEnum.USER })
    role: RolesEnum

    @ApiProperty({ required: false })
    @Column({ name: 'referral_code', nullable: true, unique: true })
    referralCode?: string

    @ApiProperty({ required: false })
    @Index('IDX_users_referred_by_user_id')
    @Column({ name: 'referred_by_user_id', type: 'uuid', nullable: true })
    referredByUserId?: string

    @ApiHideProperty()
    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'referred_by_user_id' })
    referredByUser?: User

    @ApiProperty({ required: false })
    @Column({ name: 'first_paid_at', type: 'timestamptz', nullable: true })
    firstPaidAt?: Date

    @ApiProperty()
    @Column({ name: 'has_used_trial', default: false })
    hasUsedTrial: boolean

    @ApiProperty({ required: false })
    @Column({ name: 'trial_used_at', type: 'timestamptz', nullable: true })
    trialUsedAt?: Date

    @ApiProperty()
    @Column({ name: 'total_referral_bonus_days', type: 'int', default: 0 })
    totalReferralBonusDays: number

    @ApiProperty()
    @Column({
        name: 'referral_bonus_balance_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        default: 0,
        transformer: decimalNumberTransformer,
    })
    referralBonusBalanceRub: number

    @ApiProperty()
    @Column({
        name: 'total_referral_bonus_rub',
        type: 'numeric',
        precision: 12,
        scale: 2,
        default: 0,
        transformer: decimalNumberTransformer,
    })
    totalReferralBonusRub: number

    // Inverse side must point to the relation property on Subscription
    @OneToOne(() => Subscription, (subscription) => subscription.user)
    subscription: Subscription
}
