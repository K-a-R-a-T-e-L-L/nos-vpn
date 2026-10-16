import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { User } from './user.entity'

@Entity('telegram_auth_requests')
@Index('UQ_telegram_auth_request_token_hash', ['requestTokenHash'], { unique: true })
@Index('UQ_telegram_auth_bot_token_hash', ['botTokenHash'], { unique: true })
export class TelegramAuthRequest extends BaseEntity {
    @Column({ name: 'request_token_hash' })
    requestTokenHash: string

    @Column({ name: 'bot_token_hash' })
    botTokenHash: string

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date

    @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
    confirmedAt?: Date

    @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
    consumedAt?: Date

    @Column({ name: 'user_id', type: 'uuid', nullable: true })
    userId?: string

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'user_id' })
    user?: User
}
