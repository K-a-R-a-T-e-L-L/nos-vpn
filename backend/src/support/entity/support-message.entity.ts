import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { SupportThread } from './support-thread.entity'
import {
    SupportAuthorTypeEnum,
    SupportMessageContentKindEnum,
    SupportMessageSourceEnum,
    SupportTelegramDeliveryStatusEnum,
} from './support.enum'
import { User } from '../../system/user/entity/user.entity'

export type SupportPhotoAttachment = {
    telegramFileId?: string | null
    telegramFileUniqueId?: string | null
    width?: number | null
    height?: number | null
    fileSize?: number | null
    storageProvider?: 'FILESYSTEM'
    storageKey?: string | null
    mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | null
    byteSize?: number | null
    sha256?: string | null
}

@Entity('support_message')
@Index('IDX_support_message_thread_created_at', ['threadId', 'createdAt'])
@Index('UQ_support_message_telegram_source', ['source', 'sourceTelegramChatId', 'sourceTelegramMessageId'], {
    unique: true,
    where: '"source_telegram_chat_id" IS NOT NULL AND "source_telegram_message_id" IS NOT NULL',
})
@Index('UQ_support_message_web_request', ['threadId', 'source', 'sourceRequestId'], {
    unique: true,
    where: '"source_request_id" IS NOT NULL',
})
export class SupportMessage extends BaseEntity {
    @ApiProperty()
    @Column({ name: 'thread_id', type: 'uuid' })
    threadId: string

    @ManyToOne(() => SupportThread, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'thread_id' })
    thread: SupportThread

    @ApiProperty()
    @Column({ name: 'user_id', type: 'uuid' })
    userId: string

    @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User

    @ApiProperty({ required: false })
    @Column({ name: 'admin_user_id', type: 'uuid', nullable: true })
    adminUserId?: string | null

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'admin_user_id' })
    adminUser?: User | null

    @ApiProperty({ required: false })
    @Column({ name: 'admin_telegram_id', type: 'bigint', nullable: true })
    adminTelegramId?: number | null

    @ApiProperty({ enum: SupportAuthorTypeEnum })
    @Column({ name: 'author_type', type: 'varchar' })
    authorType: SupportAuthorTypeEnum

    @ApiProperty({ enum: SupportMessageSourceEnum })
    @Column({ type: 'varchar' })
    source: SupportMessageSourceEnum

    @ApiProperty({ enum: SupportMessageContentKindEnum })
    @Column({ name: 'content_kind', type: 'varchar', default: SupportMessageContentKindEnum.TEXT })
    contentKind: SupportMessageContentKindEnum

    @ApiProperty({ required: false, nullable: true })
    @Column({ type: 'text', nullable: true })
    text?: string | null

    @Column({ type: 'jsonb', nullable: true })
    attachment?: SupportPhotoAttachment | null

    @Column({ name: 'source_telegram_chat_id', type: 'bigint', nullable: true })
    sourceTelegramChatId?: string | null

    @Column({ name: 'source_telegram_message_id', type: 'bigint', nullable: true })
    sourceTelegramMessageId?: string | null

    @Column({ name: 'source_request_id', type: 'uuid', nullable: true })
    sourceRequestId?: string | null

    @Column({ name: 'telegram_delivery_status', type: 'varchar', nullable: true })
    telegramDeliveryStatus?: SupportTelegramDeliveryStatusEnum | null

    @Column({ name: 'telegram_delivery_attempted_at', type: 'timestamptz', nullable: true })
    telegramDeliveryAttemptedAt?: Date | null

    @Column({ name: 'telegram_delivered_at', type: 'timestamptz', nullable: true })
    telegramDeliveredAt?: Date | null
}
