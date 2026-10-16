import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Markup } from 'telegraf'
import { DataSource, Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { type StoredSupportMedia, SupportMediaStorageService } from './support-media-storage.service'
import { type ValidatedSupportImageUpload, validateSupportImageUpload } from './support-media.validation'
import { BOT_CALLBACK } from '../../bot/bot.constants'
import { TelegramLoggerService } from '../../logger/logger.service'
import { NotificationService } from '../../notification/notification.service'
import { User } from '../../system/user/entity/user.entity'
import { TELEGRAM_DESTINATION, resolveTelegramDestination } from '../../telegram/telegram-destination'
import { SupportMessage } from '../entity/support-message.entity'
import type { SupportPhotoAttachment } from '../entity/support-message.entity'
import { SupportThread } from '../entity/support-thread.entity'
import {
    SupportAuthorTypeEnum,
    SupportMessageContentKindEnum,
    SupportMessageSourceEnum,
    SupportTelegramDeliveryStatusEnum,
    SupportThreadStatusEnum,
} from '../entity/support.enum'

type UserMessageSource = 'TELEGRAM' | 'WEBSITE'
type AdminReplySource = 'ADMIN_BOT' | 'ADMIN_PANEL'

export enum SupportDeliveryStatus {
    SENT = 'SENT',
    PARTIAL = 'PARTIAL',
    FAILED = 'FAILED',
    NO_TELEGRAM_ID = 'NO_TELEGRAM_ID',
    SKIPPED_DUPLICATE = 'SKIPPED_DUPLICATE',
}

type TelegramSourceReference = {
    sourceTelegramChatId?: string | number | null
    sourceTelegramMessageId?: string | number | null
}

type PersistSupportMessageInput = TelegramSourceReference & {
    userId?: string
    threadId?: string
    authorType: SupportAuthorTypeEnum
    source: SupportMessageSourceEnum
    contentKind: SupportMessageContentKindEnum
    text?: string | null
    attachment?: SupportPhotoAttachment | null
    adminUserId?: string | null
    adminTelegramId?: number | null
    sourceRequestId?: string | null
}

type PersistedSupportMessage = {
    thread: SupportThread
    user: User
    message: SupportMessage
    created: boolean
}

type AdminDeliveryClaim = {
    claimed: boolean
    claimedAt?: Date
    inProgress: boolean
}

type AdminDeliveryFinalization = {
    delivery: SupportDeliveryStatus
    alreadySent?: boolean
    inProgress?: boolean
}

const MAX_SUPPORT_TEXT_LENGTH = 4000
const MAX_TELEGRAM_PHOTO_CAPTION_LENGTH = 1024
const ADMIN_SUPPORT_DELIVERY_CLAIM_TTL_MS = 5 * 60 * 1000

@Injectable()
export class SupportService {
    constructor(
        @InjectRepository(SupportThread)
        private readonly supportThreadRepository: Repository<SupportThread>,
        @InjectRepository(SupportMessage)
        private readonly supportMessageRepository: Repository<SupportMessage>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly notificationService: NotificationService,
        private readonly configService: ConfigService,
        private readonly logger: TelegramLoggerService,
        private readonly dataSource: DataSource,
        @Optional() private readonly mediaStorage?: SupportMediaStorageService,
    ) {}

    async getCurrentUserThread(userId: string) {
        const thread = await this.supportThreadRepository.findOne({ where: { userId } })
        if (!thread) return null
        return this.buildThreadDetail(thread)
    }

    async listAdminThreads(search?: string, page = 1, pageSize = 20) {
        const safePage = Math.max(1, Number(page) || 1)
        const safePageSize = Math.min(100, Math.max(10, Number(pageSize) || 20))
        const query = this.supportThreadRepository
            .createQueryBuilder('thread')
            .leftJoinAndSelect('thread.user', 'user')
            .orderBy('thread.lastMessageAt', 'DESC')
        const normalizedSearch = String(search || '').trim()
        if (normalizedSearch) {
            query.where(
                [
                    'LOWER(user.email) LIKE LOWER(:search)',
                    'LOWER(user.telegramUsername) LIKE LOWER(:search)',
                    'CAST(user.telegramId AS TEXT) LIKE :plainSearch',
                    'CAST(user.id AS TEXT) LIKE :plainSearch',
                ].join(' OR '),
                { search: `%${normalizedSearch}%`, plainSearch: `%${normalizedSearch}%` },
            )
        }

        const total = await query.getCount()
        query.skip((safePage - 1) * safePageSize).take(safePageSize)
        const threads = await query.getMany()
        const latestMessages = await Promise.all(
            threads.map(async (thread) => ({
                threadId: thread.id,
                latestMessage: await this.supportMessageRepository.findOne({
                    where: { threadId: thread.id },
                    order: { createdAt: 'DESC' },
                }),
            })),
        )

        return {
            items: threads.map((thread) => {
                const latestMessage = latestMessages.find((item) => item.threadId === thread.id)?.latestMessage || null
                return {
                    id: thread.id,
                    status: thread.status,
                    lastMessageAt: thread.lastMessageAt,
                    lastUserMessageAt: thread.lastUserMessageAt,
                    lastAdminMessageAt: thread.lastAdminMessageAt,
                    user: this.mapUser(thread.user),
                    latestMessage: latestMessage ? this.mapMessage(latestMessage) : null,
                }
            }),
            total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.max(1, Math.ceil(total / safePageSize)),
        }
    }

    async getAdminThread(threadId: string) {
        const thread = await this.supportThreadRepository.findOne({ where: { id: threadId } })
        if (!thread) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support thread not found')
        return this.buildThreadDetail(thread)
    }

    async createUserMessage(input: TelegramSourceReference & {
        userId: string
        text?: string | null
        source: UserMessageSource
        contentKind?: SupportMessageContentKindEnum
        attachment?: SupportPhotoAttachment | null
    }) {
        const persisted = await this.persistSupportMessage({
            userId: input.userId,
            authorType: SupportAuthorTypeEnum.USER,
            source: input.source === 'TELEGRAM' ? SupportMessageSourceEnum.TELEGRAM : SupportMessageSourceEnum.WEBSITE,
            contentKind: input.contentKind || SupportMessageContentKindEnum.TEXT,
            text: input.text,
            attachment: input.attachment,
            sourceTelegramChatId: input.sourceTelegramChatId,
            sourceTelegramMessageId: input.sourceTelegramMessageId,
        })
        const thread = await this.buildThreadDetail(persisted.thread)
        if (!persisted.created) return { thread, notification: SupportDeliveryStatus.SKIPPED_DUPLICATE }
        return {
            thread,
            notification: await this.notifyAdminAboutUserMessage(persisted.thread, persisted.user, persisted.message),
        }
    }

    async createUserPhotoMessage(input: {
        userId: string
        text?: string | null
        upload: Express.Multer.File
        sourceRequestId?: string
    }) {
        const sourceRequestId = this.requireSourceRequestId(input.sourceRequestId)
        const duplicate = await this.findPhotoDuplicate({
            userId: input.userId,
            source: SupportMessageSourceEnum.WEBSITE,
            sourceRequestId,
        })
        if (duplicate) {
            const thread = duplicate.thread || await this.supportThreadRepository.findOne({ where: { id: duplicate.threadId }, relations: { user: true } })
            if (!thread) throw new NotFoundException('Support thread not found')
            return { thread: await this.buildThreadDetail(thread), notification: SupportDeliveryStatus.SKIPPED_DUPLICATE }
        }
        const attachment = await this.requireMediaStorage().write(validateSupportImageUpload(input.upload))
        let committed = false
        try {
            const persisted = await this.persistSupportMessage({
                userId: input.userId,
                authorType: SupportAuthorTypeEnum.USER,
                source: SupportMessageSourceEnum.WEBSITE,
                contentKind: SupportMessageContentKindEnum.PHOTO,
                text: input.text,
                attachment,
                sourceRequestId,
            })
            committed = true
            const thread = await this.buildThreadDetail(persisted.thread)
            if (!persisted.created) {
                await this.requireMediaStorage().cleanup(attachment.storageKey)
                return { thread, notification: SupportDeliveryStatus.SKIPPED_DUPLICATE }
            }
            return {
                thread,
                notification: await this.notifyAdminAboutUserMessage(persisted.thread, persisted.user, persisted.message),
            }
        } catch (error) {
            if (!committed) await this.requireMediaStorage().cleanup(attachment.storageKey)
            throw error
        }
    }

    async createAdminReply(input: TelegramSourceReference & {
        threadId: string
        text?: string | null
        source: AdminReplySource
        contentKind?: SupportMessageContentKindEnum
        attachment?: SupportPhotoAttachment | null
        adminUserId?: string | null
        adminTelegramId?: number | null
    }) {
        const persisted = await this.persistSupportMessage({
            threadId: input.threadId,
            authorType: SupportAuthorTypeEnum.ADMIN,
            source: input.source === 'ADMIN_BOT' ? SupportMessageSourceEnum.ADMIN_BOT : SupportMessageSourceEnum.ADMIN_PANEL,
            contentKind: input.contentKind || SupportMessageContentKindEnum.TEXT,
            text: input.text,
            attachment: input.attachment,
            adminUserId: input.adminUserId || null,
            adminTelegramId: input.adminTelegramId || null,
            sourceTelegramChatId: input.sourceTelegramChatId,
            sourceTelegramMessageId: input.sourceTelegramMessageId,
        })
        const thread = await this.buildThreadDetail(persisted.thread)
        if (!persisted.created) return { thread, messageId: persisted.message.id, delivery: SupportDeliveryStatus.SKIPPED_DUPLICATE }
        const claim = await this.claimAdminDelivery(persisted.message.id)
        if (!claim.claimed) {
            return { thread, messageId: persisted.message.id, delivery: SupportDeliveryStatus.FAILED, inProgress: claim.inProgress }
        }
        const delivery = await this.notifyUserAboutAdminReply(persisted.thread, persisted.user, persisted.message)
        const finalization = await this.finalizeAdminDelivery(persisted.message.id, claim.claimedAt!, delivery)
        return {
            thread,
            messageId: persisted.message.id,
            ...finalization,
        }
    }

    async createAdminPhotoReply(input: {
        threadId: string
        text?: string | null
        adminUserId?: string | null
        adminTelegramId?: number | null
        upload: Express.Multer.File
        sourceRequestId?: string
    }) {
        const sourceRequestId = this.requireSourceRequestId(input.sourceRequestId)
        const duplicate = await this.findPhotoDuplicate({
            threadId: input.threadId,
            source: SupportMessageSourceEnum.ADMIN_PANEL,
            sourceRequestId,
        })
        if (duplicate) {
            const thread = duplicate.thread || await this.supportThreadRepository.findOne({ where: { id: duplicate.threadId }, relations: { user: true } })
            const user = duplicate.user || await this.userRepository.findOne({ where: { id: duplicate.userId } })
            if (!thread || !user) throw new NotFoundException('Support reply context not found')
            return this.deliverAdminPersistedReply(thread, user, duplicate)
        }
        const attachment = await this.requireMediaStorage().write(validateSupportImageUpload(input.upload))
        let committed = false
        try {
            const persisted = await this.persistSupportMessage({
                threadId: input.threadId,
                authorType: SupportAuthorTypeEnum.ADMIN,
                source: SupportMessageSourceEnum.ADMIN_PANEL,
                contentKind: SupportMessageContentKindEnum.PHOTO,
                text: input.text,
                attachment,
                sourceRequestId,
                adminUserId: input.adminUserId || null,
                adminTelegramId: input.adminTelegramId || null,
            })
            committed = true
            const thread = await this.buildThreadDetail(persisted.thread)
            if (!persisted.created) {
                await this.requireMediaStorage().cleanup(attachment.storageKey)
                return this.deliverAdminPersistedReply(persisted.thread, persisted.user, persisted.message, thread)
            }
            const claim = await this.claimAdminDelivery(persisted.message.id)
            if (!claim.claimed) {
                return { thread, messageId: persisted.message.id, delivery: SupportDeliveryStatus.FAILED, inProgress: claim.inProgress }
            }
            const delivery = await this.notifyUserAboutAdminReply(persisted.thread, persisted.user, persisted.message)
            const finalization = await this.finalizeAdminDelivery(persisted.message.id, claim.claimedAt!, delivery)
            return { thread, messageId: persisted.message.id, ...finalization }
        } catch (error) {
            if (!committed) await this.requireMediaStorage().cleanup(attachment.storageKey)
            throw error
        }
    }

    async getMediaForUser(userId: string, messageId: string): Promise<StoredSupportMedia> {
        const message = await this.supportMessageRepository
            .createQueryBuilder('message')
            .innerJoin('message.thread', 'thread')
            .where('message.id = :messageId', { messageId })
            .andWhere('thread.user_id = :userId', { userId })
            .getOne()
        return this.resolveMessageMedia(message)
    }

    async getMediaForAdmin(messageId: string): Promise<StoredSupportMedia> {
        const message = await this.supportMessageRepository.findOne({ where: { id: messageId } })
        return this.resolveMessageMedia(message)
    }

    async retryAdminDelivery(messageId: string) {
        const message = await this.supportMessageRepository.findOne({
            where: { id: messageId, authorType: SupportAuthorTypeEnum.ADMIN },
            relations: { thread: true, user: true },
        })
        if (
            !message ||
            (message.source !== SupportMessageSourceEnum.ADMIN_BOT && message.source !== SupportMessageSourceEnum.ADMIN_PANEL)
        ) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support admin reply not found')
        }
        const thread = message.thread || (await this.supportThreadRepository.findOne({ where: { id: message.threadId } }))
        const user = message.user || (await this.userRepository.findOne({ where: { id: message.userId } }))
        if (!thread || !user) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support reply context not found')
        if (message.telegramDeliveryStatus === SupportTelegramDeliveryStatusEnum.SENT) {
            return { messageId: message.id, delivery: SupportDeliveryStatus.SENT, alreadySent: true }
        }
        const cutoff = new Date(Date.now() - ADMIN_SUPPORT_DELIVERY_CLAIM_TTL_MS)
        const staleClaim =
            message.telegramDeliveryStatus === SupportTelegramDeliveryStatusEnum.SENDING &&
            message.telegramDeliveryAttemptedAt instanceof Date &&
            message.telegramDeliveryAttemptedAt < cutoff
        const claim = await this.claimAdminDelivery(message.id)
        if (!claim.claimed) {
            const current = await this.supportMessageRepository.findOne({
                where: { id: message.id, authorType: SupportAuthorTypeEnum.ADMIN },
            })
            if (
                !current ||
                (current.source !== SupportMessageSourceEnum.ADMIN_BOT &&
                    current.source !== SupportMessageSourceEnum.ADMIN_PANEL)
            ) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support admin reply not found')
            }
            if (current.telegramDeliveryStatus === SupportTelegramDeliveryStatusEnum.SENT) {
                return { messageId: message.id, delivery: SupportDeliveryStatus.SENT, alreadySent: true }
            }
            return {
                messageId: message.id,
                delivery: SupportDeliveryStatus.FAILED,
                inProgress: claim.inProgress || current.telegramDeliveryStatus === SupportTelegramDeliveryStatusEnum.SENDING,
            }
        }
        if (staleClaim) {
            this.logger.warn({ event: 'support_delivery_stale_claim_reclaimed', messageId: message.id }, SupportService.name)
        }
        const delivery = await this.notifyUserAboutAdminReply(thread, user, message)
        const finalization = await this.finalizeAdminDelivery(message.id, claim.claimedAt!, delivery)
        return { messageId: message.id, ...finalization }
    }

    async closeThread(threadId: string) {
        const thread = await this.supportThreadRepository.findOne({ where: { id: threadId } })
        if (!thread) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support thread not found')
        thread.status = SupportThreadStatusEnum.CLOSED
        return this.supportThreadRepository.save(thread)
    }

    private async resolveMessageMedia(message?: SupportMessage | null): Promise<StoredSupportMedia> {
        if (!message || message.contentKind !== SupportMessageContentKindEnum.PHOTO || !message.attachment) {
            throw new NotFoundException('Support media is unavailable')
        }
        if (message.attachment.storageKey) {
            try {
                return await this.requireMediaStorage().read(message.attachment.storageKey)
            } catch {
                throw new NotFoundException('Support media is unavailable')
            }
        }
        const telegramFileId = String(message.attachment.telegramFileId || '').trim()
        if (!telegramFileId) throw new NotFoundException('Support media is unavailable')
        try {
            const buffer = await this.notificationService.downloadTelegramPhoto(telegramFileId)
            const image = validateSupportImageUpload({ buffer, size: buffer.length } as Express.Multer.File)
            return { buffer, mimeType: image.mimeType, byteSize: image.byteSize }
        } catch {
            throw new NotFoundException('Support media is unavailable')
        }
    }

    private requireMediaStorage() {
        if (!this.mediaStorage) throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support media storage is unavailable')
        return this.mediaStorage
    }

    private async findPhotoDuplicate(input: {
        userId?: string
        threadId?: string
        source: SupportMessageSourceEnum
        sourceRequestId: string
    }) {
        const thread = input.threadId
            ? await this.supportThreadRepository.findOne({ where: { id: input.threadId }, relations: { user: true } })
            : await this.supportThreadRepository.findOne({ where: { userId: input.userId }, relations: { user: true } })
        if (!thread) return null
        const candidate = await this.supportMessageRepository.findOne({
            where: { threadId: thread.id, source: input.source, sourceRequestId: input.sourceRequestId } as any,
            relations: { thread: true, user: true },
        })
        if (!candidate || candidate.source !== input.source || candidate.sourceRequestId !== input.sourceRequestId) return null
        return candidate
    }

    private requireSourceRequestId(value?: string) {
        const normalized = String(value || '').trim()
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
            throw new BadRequestException('A valid Idempotency-Key UUID is required')
        }
        return normalized
    }

    private async deliverAdminPersistedReply(thread: SupportThread, user: User, message: SupportMessage, detail?: any) {
        const threadDetail = detail || await this.buildThreadDetail(thread)
        if (message.telegramDeliveryStatus === SupportTelegramDeliveryStatusEnum.SENT) {
            return { thread: threadDetail, messageId: message.id, delivery: SupportDeliveryStatus.SENT, alreadySent: true }
        }
        const claim = await this.claimAdminDelivery(message.id)
        if (!claim.claimed) return { thread: threadDetail, messageId: message.id, delivery: SupportDeliveryStatus.FAILED, inProgress: claim.inProgress }
        const delivery = await this.notifyUserAboutAdminReply(thread, user, message)
        const finalization = await this.finalizeAdminDelivery(message.id, claim.claimedAt!, delivery)
        return { thread: threadDetail, messageId: message.id, ...finalization }
    }

    private async persistSupportMessage(input: PersistSupportMessageInput): Promise<PersistedSupportMessage> {
        const text = this.normalizeMessageText(input.contentKind, input.text)
        const attachment = this.normalizeAttachment(input.contentKind, input.attachment)
        const sourceTelegramChatId = this.normalizeTelegramIdentifier(input.sourceTelegramChatId)
        const sourceTelegramMessageId = this.normalizeTelegramIdentifier(input.sourceTelegramMessageId)
        const sourceRequestId = input.sourceRequestId ? this.requireSourceRequestId(input.sourceRequestId) : null
        if (Boolean(sourceTelegramChatId) !== Boolean(sourceTelegramMessageId)) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Telegram source identifiers must be provided together')
        }

        return this.dataSource.transaction(async (manager) => {
            const userRepository = manager.getRepository(User)
            const threadRepository = manager.getRepository(SupportThread)
            const messageRepository = manager.getRepository(SupportMessage)
            const now = new Date()
            let thread: SupportThread | null
            let user: User | null
            if (input.threadId) {
                thread = await this.findLockedThread(threadRepository, 'thread.id = :threadId', { threadId: input.threadId })
                if (!thread) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support thread not found')
                user = await userRepository.findOne({ where: { id: thread.userId } })
                if (!user) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
            } else {
                if (!input.userId) throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support user is required')
                user = await userRepository.findOne({ where: { id: input.userId } })
                if (!user) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
                await threadRepository
                    .createQueryBuilder()
                    .insert()
                    .values({ userId: user.id, status: SupportThreadStatusEnum.OPEN, lastMessageAt: now })
                    .orIgnore()
                    .execute()
                thread = await this.findLockedThread(threadRepository, 'thread.user_id = :userId', { userId: user.id })
                if (!thread) throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support thread could not be created')
            }

            if (sourceRequestId) {
                const existing = await messageRepository.findOne({
                    where: { threadId: thread.id, source: input.source, sourceRequestId } as any,
                    relations: { thread: true, user: true },
                })
                if (existing) return { thread, user, message: existing, created: false }
            }

            const insertResult = await messageRepository
                .createQueryBuilder()
                .insert()
                .values({
                    threadId: thread.id,
                    userId: user.id,
                    adminUserId: input.adminUserId || null,
                    adminTelegramId: input.adminTelegramId || null,
                    authorType: input.authorType,
                    source: input.source,
                    contentKind: input.contentKind,
                    text,
                    attachment,
                    sourceTelegramChatId,
                    sourceTelegramMessageId,
                    sourceRequestId,
                    telegramDeliveryStatus:
                        input.authorType === SupportAuthorTypeEnum.ADMIN
                            ? SupportTelegramDeliveryStatusEnum.PENDING
                            : null,
                } as any)
                .orIgnore()
                .returning('id')
                .execute()
            const insertedId = String(insertResult.raw?.[0]?.id || insertResult.identifiers[0]?.id || '').trim()
            const created = Boolean(insertedId)
            const message = created
                ? await messageRepository.findOne({ where: { id: insertedId } })
                : await messageRepository.findOne({
                      where: sourceRequestId
                          ? { threadId: thread.id, source: input.source, sourceRequestId } as any
                          : { source: input.source, sourceTelegramChatId, sourceTelegramMessageId } as any,
                  })
            if (!message) throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support message could not be saved')

            if (created) {
                thread.status = SupportThreadStatusEnum.OPEN
                thread.lastMessageAt = now
                if (input.authorType === SupportAuthorTypeEnum.USER) thread.lastUserMessageAt = now
                else thread.lastAdminMessageAt = now
                await threadRepository.save(thread)
            }
            return { thread, user, message, created }
        })
    }

    private async buildThreadDetail(thread: SupportThread) {
        const loadedThread =
            thread.user && thread.id
                ? thread
                : await this.supportThreadRepository.findOne({ where: { id: thread.id }, relations: { user: true } })
        if (!loadedThread) throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support thread not found')

        const messages = await this.supportMessageRepository.find({
            where: { threadId: loadedThread.id },
            order: { createdAt: 'ASC' },
        })
        return {
            id: loadedThread.id,
            status: loadedThread.status,
            lastMessageAt: loadedThread.lastMessageAt,
            lastUserMessageAt: loadedThread.lastUserMessageAt,
            lastAdminMessageAt: loadedThread.lastAdminMessageAt,
            user: this.mapUser(loadedThread.user),
            messages: messages.map((message) => this.mapMessage(message)),
        }
    }

    private findLockedThread(threadRepository: Repository<SupportThread>, condition: string, parameters: Record<string, string>) {
        return threadRepository
            .createQueryBuilder('thread')
            .setLock('pessimistic_write', undefined, ['thread'])
            .where(condition, parameters)
            .getOne()
    }

    private async notifyAdminAboutUserMessage(thread: SupportThread, user: User, message: SupportMessage) {
        const supportChatId = resolveTelegramDestination(this.configService, TELEGRAM_DESTINATION.SUPPORT)
        if (!supportChatId) return SupportDeliveryStatus.FAILED
        if (message.contentKind === SupportMessageContentKindEnum.PHOTO && message.attachment) {
            return this.notifyAdminAboutUserPhoto(supportChatId, thread, user, message)
        }

        let metadata: any
        try {
            metadata = await this.notificationService.notify(
                supportChatId,
                this.buildSupportMetadata(thread, user, message.source),
                this.replyButton(thread.id),
            )
        } catch (error: any) {
            this.logDeliveryFailure('support_admin_metadata_failed', thread.id, error)
            return SupportDeliveryStatus.FAILED
        }
        try {
            await this.notificationService.notify(supportChatId, message.text || '', this.payloadReply(metadata))
            return SupportDeliveryStatus.SENT
        } catch (error: any) {
            this.logDeliveryFailure('support_admin_text_payload_failed', thread.id, error)
            return SupportDeliveryStatus.PARTIAL
        }
    }

    private async notifyAdminAboutUserPhoto(
        supportChatId: string,
        thread: SupportThread,
        user: User,
        message: SupportMessage,
    ) {
        let metadata: any
        try {
            metadata = await this.notificationService.notify(
                supportChatId,
                this.buildSupportMetadata(thread, user, message.source, '🆘 Новое изображение в поддержку'),
                this.replyButton(thread.id),
            )
        } catch (error: any) {
            this.logDeliveryFailure('support_admin_photo_metadata_failed', thread.id, error)
            return SupportDeliveryStatus.FAILED
        }
        try {
            await this.sendSupportPhoto(supportChatId, message, message.text || undefined, this.payloadReply(metadata))
            return SupportDeliveryStatus.SENT
        } catch (error: any) {
            this.logDeliveryFailure('support_admin_photo_payload_failed', thread.id, error)
            return SupportDeliveryStatus.PARTIAL
        }
    }

    private async notifyUserAboutAdminReply(thread: SupportThread, user: User, message: SupportMessage) {
        if (!user.telegramId) return SupportDeliveryStatus.NO_TELEGRAM_ID
        try {
            if (message.contentKind === SupportMessageContentKindEnum.PHOTO && message.attachment) {
                await this.sendSupportPhoto(user.telegramId, message, message.text || undefined)
            } else {
                await this.notificationService.notify(user.telegramId, message.text || '')
            }
            return SupportDeliveryStatus.SENT
        } catch (error: any) {
            this.logDeliveryFailure('support_user_reply_delivery_failed', thread.id, error)
            return SupportDeliveryStatus.FAILED
        }
    }

    private async sendSupportPhoto(
        chatId: string | number,
        message: SupportMessage,
        caption?: string | null,
        extra: Record<string, any> = {},
    ) {
        const telegramFileId = String(message.attachment?.telegramFileId || '').trim()
        if (telegramFileId) {
            if (!Object.keys(extra).length) {
                return this.notificationService.notifyWithTelegramPhotoId(chatId, telegramFileId, caption)
            }
            return this.notificationService.notifyWithTelegramPhotoId(chatId, telegramFileId, caption, extra)
        }
        const storageKey = String(message.attachment?.storageKey || '').trim()
        if (!storageKey) throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support photo is unavailable')
        const media = await this.requireMediaStorage().read(storageKey)
        return this.notificationService.notifyWithSupportMedia(chatId, media.buffer, this.supportMediaFilename(media.mimeType), caption, extra)
    }

    private supportMediaFilename(mimeType: StoredSupportMedia['mimeType']) {
        if (mimeType === 'image/jpeg') return 'support-photo.jpg'
        if (mimeType === 'image/png') return 'support-photo.png'
        return 'support-photo.webp'
    }

    private async claimAdminDelivery(messageId: string): Promise<AdminDeliveryClaim> {
        const cutoff = new Date(Date.now() - ADMIN_SUPPORT_DELIVERY_CLAIM_TTL_MS)
        const claimedAt = new Date()
        const result = await this.supportMessageRepository
            .createQueryBuilder()
            .update(SupportMessage)
            .set({
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
                telegramDeliveryAttemptedAt: claimedAt,
            })
            .where('id = :messageId', { messageId })
            .andWhere('author_type = :authorType', { authorType: SupportAuthorTypeEnum.ADMIN })
            .andWhere('source IN (:...sources)', {
                sources: [SupportMessageSourceEnum.ADMIN_BOT, SupportMessageSourceEnum.ADMIN_PANEL],
            })
            .andWhere(
                '(telegram_delivery_status IS NULL OR telegram_delivery_status IN (:...retryable) OR (telegram_delivery_status = :sending AND telegram_delivery_attempted_at < :cutoff))',
                {
                    retryable: [SupportTelegramDeliveryStatusEnum.PENDING, SupportTelegramDeliveryStatusEnum.FAILED],
                    sending: SupportTelegramDeliveryStatusEnum.SENDING,
                    cutoff,
                },
            )
            .returning('id')
            .execute()
        if (Number(result.affected || 0) > 0 || result.raw?.[0]?.id) return { claimed: true, claimedAt, inProgress: false }
        return { claimed: false, inProgress: true }
    }

    private async finalizeAdminDelivery(messageId: string, claimedAt: Date, delivery: SupportDeliveryStatus): Promise<AdminDeliveryFinalization> {
        if (delivery !== SupportDeliveryStatus.SENT && delivery !== SupportDeliveryStatus.FAILED && delivery !== SupportDeliveryStatus.NO_TELEGRAM_ID) {
            return { delivery }
        }
        const telegramDeliveryStatus = delivery === SupportDeliveryStatus.SENT
            ? SupportTelegramDeliveryStatusEnum.SENT
            : SupportTelegramDeliveryStatusEnum.FAILED
        const telegramDeliveredAt = delivery === SupportDeliveryStatus.SENT ? new Date() : null
        const result = await this.supportMessageRepository
            .createQueryBuilder()
            .update(SupportMessage)
            .set({ telegramDeliveryStatus, telegramDeliveredAt })
            .where('id = :messageId', { messageId })
            .andWhere('author_type = :authorType', { authorType: SupportAuthorTypeEnum.ADMIN })
            .andWhere('source IN (:...sources)', {
                sources: [SupportMessageSourceEnum.ADMIN_BOT, SupportMessageSourceEnum.ADMIN_PANEL],
            })
            .andWhere('telegram_delivery_status = :sending', { sending: SupportTelegramDeliveryStatusEnum.SENDING })
            .andWhere('telegram_delivery_attempted_at = :claimedAt', { claimedAt })
            .execute()
        if (Number(result.affected || 0) > 0) return { delivery }

        this.logger.warn({ event: 'support_delivery_finalize_fenced', messageId }, SupportService.name)
        const current = await this.supportMessageRepository.findOne({
            where: { id: messageId, authorType: SupportAuthorTypeEnum.ADMIN },
        })
        if (
            !current ||
            (current.source !== SupportMessageSourceEnum.ADMIN_BOT && current.source !== SupportMessageSourceEnum.ADMIN_PANEL)
        ) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Support admin reply not found')
        }
        if (current.telegramDeliveryStatus === SupportTelegramDeliveryStatusEnum.SENT) {
            return { delivery: SupportDeliveryStatus.SENT, alreadySent: true }
        }
        return {
            delivery: SupportDeliveryStatus.FAILED,
            inProgress: current.telegramDeliveryStatus === SupportTelegramDeliveryStatusEnum.SENDING,
        }
    }

    private buildSupportMetadata(
        thread: SupportThread,
        user: User,
        source: SupportMessageSourceEnum,
        heading = '🆘 Новое сообщение в поддержку',
    ) {
        const sourceLabel = source === SupportMessageSourceEnum.WEBSITE ? 'website' : 'telegram'
        return [
            heading,
            `Source: ${sourceLabel}`,
            `Поток: ${thread.id}`,
            `Пользователь: ${this.buildUserDisplayName(user)}`,
            `Telegram ID: ${user.telegramId || '-'}`,
            `Email: ${user.email || '-'}`,
            `Время: ${new Date().toISOString()}`,
        ].join('\n')
    }

    private replyButton(threadId: string) {
        return {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✍️ Ответить', `${BOT_CALLBACK.SUPPORT_ADMIN_REPLY_PREFIX}${threadId}`)],
            ]).reply_markup,
        }
    }

    private payloadReply(metadata: any) {
        const messageId = Number(metadata?.message_id)
        return Number.isInteger(messageId) && messageId > 0 ? { reply_parameters: { message_id: messageId } } : {}
    }

    private mapUser(user?: User | null) {
        if (!user) return null
        return {
            id: user.id,
            email: user.email || null,
            telegramId: user.telegramId || null,
            telegramUsername: user.telegramUsername || null,
            telegramFirstName: user.telegramFirstName || null,
            telegramLastName: user.telegramLastName || null,
        }
    }

    private mapMessage(message: SupportMessage) {
        return {
            id: message.id,
            threadId: message.threadId,
            userId: message.userId,
            adminUserId: message.adminUserId || null,
            adminTelegramId: message.adminTelegramId || null,
            authorType: message.authorType,
            source: message.source,
            contentKind: message.contentKind,
            hasAttachment: Boolean(message.attachment),
            text: message.text || null,
            createdAt: message.createdAt,
        }
    }

    private normalizeMessageText(contentKind: SupportMessageContentKindEnum, value?: string | null) {
        const text = String(value || '').trim()
        if (contentKind === SupportMessageContentKindEnum.TEXT) {
            if (!text) throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support message text is required')
            if (text.length > MAX_SUPPORT_TEXT_LENGTH) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support message text is too long')
            }
            return text
        }
        if (text.length > MAX_TELEGRAM_PHOTO_CAPTION_LENGTH) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support photo caption is too long')
        }
        return text || null
    }

    private normalizeAttachment(contentKind: SupportMessageContentKindEnum, attachment?: SupportPhotoAttachment | null) {
        if (contentKind === SupportMessageContentKindEnum.TEXT) return null
        const telegramFileId = String(attachment?.telegramFileId || '').trim()
        const storageKey = String(attachment?.storageKey || '').trim()
        if (!telegramFileId && !storageKey) throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support photo is required')
        const storageProvider = attachment?.storageProvider === 'FILESYSTEM' ? 'FILESYSTEM' : undefined
        const mimeType = attachment?.mimeType
        if (storageKey && (!storageProvider || !mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType))) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Support photo storage metadata is invalid')
        }
        return {
            telegramFileId: telegramFileId || null,
            telegramFileUniqueId: String(attachment?.telegramFileUniqueId || '').trim() || null,
            width: this.normalizeOptionalNumber(attachment?.width),
            height: this.normalizeOptionalNumber(attachment?.height),
            fileSize: this.normalizeOptionalNumber(attachment?.fileSize),
            ...(storageKey
                ? {
                      storageProvider,
                      storageKey,
                      mimeType,
                      byteSize: this.normalizeOptionalNumber(attachment?.byteSize),
                      sha256: String(attachment?.sha256 || '').trim() || null,
                  }
                : {}),
        }
    }

    private normalizeTelegramIdentifier(value?: string | number | null) {
        const normalized = String(value || '').trim()
        return normalized || null
    }

    private normalizeOptionalNumber(value?: number | string | null) {
        if (value === null || value === undefined || value === '') return null
        const number = Number(value)
        return Number.isFinite(number) && number >= 0 ? number : null
    }

    private buildUserDisplayName(user: User) {
        if (user.email) return user.email
        if (user.telegramUsername) return `@${user.telegramUsername}`
        const fullName = `${String(user.telegramFirstName || '').trim()} ${String(user.telegramLastName || '').trim()}`.trim()
        return fullName || user.id
    }

    private logDeliveryFailure(event: string, threadId: string, error: any) {
        this.logger.warn(
            { event, threadId, errorName: error instanceof Error ? error.name : 'UnknownError' },
            SupportService.name,
        )
    }
}
