import { ApiHideProperty, ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { User } from './user.entity'

@Entity('telegram_site_link_requests')
export class TelegramSiteLinkRequest extends BaseEntity {
    @ApiHideProperty()
    @Column({ name: 'code_hash', unique: true })
    codeHash: string

    @ApiProperty()
    @Column({ name: 'telegram_id', type: 'bigint' })
    telegramId: number

    @ApiProperty({ required: false })
    @Column({ name: 'telegram_username', nullable: true })
    telegramUsername?: string

    @ApiProperty({ required: false })
    @Column({ name: 'telegram_first_name', nullable: true })
    telegramFirstName?: string

    @ApiProperty({ required: false })
    @Column({ name: 'telegram_last_name', nullable: true })
    telegramLastName?: string

    @ApiProperty({ required: false })
    @Column({ name: 'telegram_is_premium', nullable: true })
    telegramIsPremium?: boolean

    @ApiProperty({ required: false })
    @Column({ name: 'telegram_language_code', nullable: true })
    telegramLanguageCode?: string

    @ApiProperty({ type: String, format: 'date-time' })
    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date

    @ApiProperty({ required: false, type: String, format: 'date-time' })
    @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
    consumedAt?: Date

    @ApiHideProperty()
    @Index('IDX_telegram_site_link_requests_linked_user_id')
    @Column({ name: 'linked_user_id', type: 'uuid', nullable: true })
    linkedUserId?: string

    @ApiHideProperty()
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'linked_user_id' })
    linkedUser?: User
}
