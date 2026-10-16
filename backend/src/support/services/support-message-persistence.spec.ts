import { SupportDeliveryStatus, SupportService } from './support.service'
import { SupportMessageContentKindEnum, SupportTelegramDeliveryStatusEnum } from '../entity/support.enum'

const THREAD_ID = '11111111-1111-4111-8111-111111111111'
const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082', 'hex')
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'

function makeInsertBuilder(execute: jest.Mock) {
    const builder: any = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute,
    }
    return builder
}

function makeService(options: {
    messageInsertError?: Error
    threadSaveError?: Error
    noTelegramId?: boolean
    duplicate?: boolean
    notificationError?: Error
    photo?: boolean
    metadataError?: Error
    payloadError?: Error
    adminDeliveryStatus?: SupportTelegramDeliveryStatusEnum | null
    adminDeliveryAttemptedAt?: Date | null
    claimAffected?: number
    mediaStorage?: { write: jest.Mock; read: jest.Mock; cleanup: jest.Mock }
} = {}) {
    const user = { id: 'user-1', email: 'user@example.test', telegramId: options.noTelegramId ? null : '42' }
    const thread: any = { id: THREAD_ID, userId: user.id, user, status: 'OPEN', lastMessageAt: new Date() }
    const message: any = {
        id: 'message-1',
        threadId: THREAD_ID,
        userId: user.id,
        authorType: 'USER',
        source: 'TELEGRAM',
        contentKind: options.photo ? SupportMessageContentKindEnum.PHOTO : SupportMessageContentKindEnum.TEXT,
        text: options.photo ? 'Скриншот ошибки' : 'Нужна помощь',
        attachment: options.photo ? { telegramFileId: 'photo-file-id', telegramFileUniqueId: 'photo-unique' } : null,
        createdAt: new Date(),
    }
    const threadInsert = makeInsertBuilder(jest.fn().mockResolvedValue({ identifiers: [] }))
    const threadLock = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(thread),
    }
    const messageInsert = makeInsertBuilder(
        jest.fn().mockImplementation(async () => {
            if (options.messageInsertError) throw options.messageInsertError
            return { identifiers: options.duplicate ? [] : [{ id: message.id }] }
        }),
    )
    let insertedValues: any = null
    messageInsert.values.mockImplementation((values: any) => {
        insertedValues = values
        return messageInsert
    })
    const managerThreadRepository = {
        createQueryBuilder: jest.fn().mockImplementation((alias?: string) => (alias ? threadLock : threadInsert)),
        findOne: jest.fn().mockResolvedValue(thread),
        save: jest.fn().mockImplementation(async () => {
            if (options.threadSaveError) throw options.threadSaveError
            return thread
        }),
    }
    const managerMessageRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(messageInsert),
        findOne: jest.fn().mockImplementation(async (options?: any) => options?.where?.sourceRequestId ? null : ({ ...message, ...(insertedValues || {}) })),
    }
    const manager = {
        getRepository: jest.fn((entity: any) => {
            if (entity.name === 'User') return { findOne: jest.fn().mockResolvedValue(user) }
            if (entity.name === 'SupportThread') return managerThreadRepository
            return managerMessageRepository
        }),
    }
    const dataSource = { transaction: jest.fn(async (operation: any) => operation(manager)) }
    const supportThreadRepository = { findOne: jest.fn().mockResolvedValue(thread) }
    const existingAdminMessage: any = {
        ...message,
        authorType: 'ADMIN',
        source: 'ADMIN_BOT',
        contentKind: options.photo ? SupportMessageContentKindEnum.PHOTO : SupportMessageContentKindEnum.TEXT,
        text: options.photo ? 'Сохранённый снимок' : 'Сохранённый ответ',
        telegramDeliveryStatus: options.adminDeliveryStatus ?? null,
        telegramDeliveryAttemptedAt: options.adminDeliveryAttemptedAt ?? null,
        thread,
        user,
    }
    const updateBuilder: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockImplementation((values: any) => {
            updateBuilder.valuesToApply = values
            return updateBuilder
        }),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockImplementation(async () => {
            const affected = options.claimAffected ?? 1
            if (affected > 0) Object.assign(existingAdminMessage, updateBuilder.valuesToApply || {})
            return { affected, raw: affected > 0 ? [{ id: 'message-1' }] : [] }
        }),
    }
    const supportMessageRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
        find: jest.fn().mockImplementation(async () => [{ ...message, ...(insertedValues || {}) }]),
        findOne: jest.fn().mockImplementation(async (options?: any) => options?.where?.sourceRequestId ? null : existingAdminMessage),
        save: jest.fn().mockImplementation(async (value: any) => Object.assign(existingAdminMessage, value)),
    }
    const notificationService = {
        notify: jest
            .fn()
            .mockImplementationOnce(options.metadataError || options.notificationError ? async () => { throw options.metadataError || options.notificationError } : async () => ({ message_id: 101 }))
            .mockImplementationOnce(options.payloadError || options.notificationError ? async () => { throw options.payloadError || options.notificationError } : async () => undefined),
        notifyWithTelegramPhotoId: jest
            .fn()
            .mockImplementationOnce(options.payloadError ? async () => { throw options.payloadError } : async () => undefined),
        notifyWithSupportMedia: jest.fn().mockResolvedValue(undefined),
    }
    const service = new SupportService(
        supportThreadRepository as any,
        supportMessageRepository as any,
        {} as any,
        notificationService as any,
        { get: jest.fn().mockReturnValue('-100999') } as any,
        { warn: jest.fn(), error: jest.fn() } as any,
        dataSource as any,
        options.mediaStorage as any,
    )
    return { service, dataSource, notificationService, managerThreadRepository, messageInsert, supportMessageRepository, existingAdminMessage }
}

describe('SupportService message persistence', () => {
    it('persists a user web photo before metadata-first support delivery and keeps private storage metadata out of the read model', async () => {
        const mediaStorage = {
            write: jest.fn().mockResolvedValue({ storageProvider: 'FILESYSTEM', storageKey: '11111111-1111-4111-8111-111111111111.png', mimeType: 'image/png', byteSize: 8, sha256: 'a'.repeat(64) }),
            read: jest.fn().mockResolvedValue({ buffer: Buffer.from('image'), mimeType: 'image/png', byteSize: 5 }),
            cleanup: jest.fn(),
        }
        const { service, notificationService } = makeService({ mediaStorage })
        notificationService.notifyWithSupportMedia = jest.fn().mockResolvedValue(undefined)

        const result = await service.createUserPhotoMessage({
            userId: 'user-1',
            text: 'Скриншот',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
            sourceRequestId: REQUEST_ID,
        })

        expect(result.notification).toBe(SupportDeliveryStatus.SENT)
        expect(mediaStorage.write).toHaveBeenCalledTimes(1)
        expect(notificationService.notify).toHaveBeenCalledWith('-100999', expect.stringContaining('🆘 Новое изображение в поддержку'), expect.any(Object))
        expect(notificationService.notifyWithSupportMedia).toHaveBeenCalledWith('-100999', Buffer.from('image'), 'support-photo.png', 'Скриншот', expect.any(Object))
        expect((service as any).mapMessage({ id: 'message-1', threadId: THREAD_ID, userId: 'user-1', authorType: 'USER', source: 'WEBSITE', contentKind: SupportMessageContentKindEnum.PHOTO, attachment: await mediaStorage.write.mock.results[0].value, text: 'Скриншот', createdAt: new Date() })).not.toHaveProperty('attachment')
    })

    it('cleans a staged user web photo when persistence fails before ownership commits', async () => {
        const mediaStorage = {
            write: jest.fn().mockResolvedValue({ storageProvider: 'FILESYSTEM', storageKey: '11111111-1111-4111-8111-111111111111.png', mimeType: 'image/png', byteSize: 8, sha256: 'a'.repeat(64) }),
            read: jest.fn(), cleanup: jest.fn(),
        }
        const { service } = makeService({ mediaStorage, messageInsertError: new Error('db failed') })

        await expect(service.createUserPhotoMessage({
            userId: 'user-1',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
            sourceRequestId: REQUEST_ID,
        })).rejects.toThrow('db failed')
        expect(mediaStorage.cleanup).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111.png')
    })

    it('retains a committed web photo when a post-commit read-model operation fails', async () => {
        const mediaStorage = {
            write: jest.fn().mockResolvedValue({ storageProvider: 'FILESYSTEM', storageKey: '11111111-1111-4111-8111-111111111111.png', mimeType: 'image/png', byteSize: 8, sha256: 'a'.repeat(64) }),
            read: jest.fn(), cleanup: jest.fn(),
        }
        const { service } = makeService({ mediaStorage })
        ;(service as any).buildThreadDetail = jest.fn().mockRejectedValue(new Error('read model failed after commit'))

        await expect(service.createUserPhotoMessage({
            userId: 'user-1',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
            sourceRequestId: REQUEST_ID,
        })).rejects.toThrow('read model failed after commit')
        expect(mediaStorage.cleanup).not.toHaveBeenCalled()
    })

    it('delivers and retries a web-admin photo from the same persisted storage row without duplicate history', async () => {
        const attachment = { storageProvider: 'FILESYSTEM' as const, storageKey: '11111111-1111-4111-8111-111111111111.png', mimeType: 'image/png' as const, byteSize: 8, sha256: 'a'.repeat(64) }
        const mediaStorage = {
            write: jest.fn().mockResolvedValue(attachment),
            read: jest.fn().mockResolvedValue({ buffer: Buffer.from('image'), mimeType: 'image/png', byteSize: 5 }),
            cleanup: jest.fn(),
        }
        const { service, notificationService, existingAdminMessage, supportMessageRepository } = makeService({ mediaStorage, photo: true })
        existingAdminMessage.attachment = attachment
        existingAdminMessage.contentKind = SupportMessageContentKindEnum.PHOTO
        notificationService.notifyWithSupportMedia = jest.fn().mockResolvedValue(undefined)

        const created = await service.createAdminPhotoReply({
            threadId: THREAD_ID,
            text: 'Ответ с изображением',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
            sourceRequestId: REQUEST_ID,
        })
        expect(created.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(notificationService.notifyWithSupportMedia).toHaveBeenCalledWith('42', Buffer.from('image'), 'support-photo.png', 'Ответ с изображением', {})

        existingAdminMessage.telegramDeliveryStatus = SupportTelegramDeliveryStatusEnum.FAILED
        notificationService.notifyWithSupportMedia.mockClear()
        const retried = await service.retryAdminDelivery(existingAdminMessage.id)
        expect(retried.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(mediaStorage.read).toHaveBeenCalledWith(attachment.storageKey)
        expect(notificationService.notifyWithSupportMedia).toHaveBeenCalledTimes(1)

        notificationService.notifyWithSupportMedia.mockClear()
        const alreadySent = await service.retryAdminDelivery(existingAdminMessage.id)
        expect(alreadySent.alreadySent).toBe(true)
        expect(notificationService.notifyWithSupportMedia).not.toHaveBeenCalled()
        expect(supportMessageRepository.save).not.toHaveBeenCalled()
    })

    it('fast-paths a duplicate website request before writing a second file or notifying support', async () => {
        const mediaStorage = { write: jest.fn(), read: jest.fn(), cleanup: jest.fn() }
        const { service, notificationService, existingAdminMessage } = makeService({ mediaStorage })
        existingAdminMessage.source = 'WEBSITE'
        existingAdminMessage.sourceRequestId = REQUEST_ID
        ;(service as any).findPhotoDuplicate = jest.fn().mockResolvedValue(existingAdminMessage)

        const result = await service.createUserPhotoMessage({
            userId: 'user-1',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
            sourceRequestId: REQUEST_ID,
        })
        expect(result.notification).toBe(SupportDeliveryStatus.SKIPPED_DUPLICATE)
        expect(mediaStorage.write).not.toHaveBeenCalled()
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('cleans only the staged loser file when the database uniqueness race returns an existing website photo', async () => {
        const loserKey = '22222222-2222-4222-8222-222222222222.png'
        const mediaStorage = {
            write: jest.fn().mockResolvedValue({ storageProvider: 'FILESYSTEM', storageKey: loserKey, mimeType: 'image/png', byteSize: 8, sha256: 'b'.repeat(64) }),
            read: jest.fn(),
            cleanup: jest.fn(),
        }
        const { service, notificationService } = makeService({ mediaStorage })
        ;(service as any).persistSupportMessage = jest.fn().mockResolvedValue({
            created: false,
            thread: { id: THREAD_ID, userId: 'user-1', user: { id: 'user-1' } },
            user: { id: 'user-1' },
            message: { id: 'winner-message' },
        })
        ;(service as any).buildThreadDetail = jest.fn().mockResolvedValue({ id: THREAD_ID })

        const result = await service.createUserPhotoMessage({
            userId: 'user-1',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
            sourceRequestId: REQUEST_ID,
        })

        expect(result.notification).toBe(SupportDeliveryStatus.SKIPPED_DUPLICATE)
        expect(mediaStorage.cleanup).toHaveBeenCalledTimes(1)
        expect(mediaStorage.cleanup).toHaveBeenCalledWith(loserKey)
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('rejects a missing or malformed web-photo idempotency key before storage or database work', async () => {
        const mediaStorage = { write: jest.fn(), read: jest.fn(), cleanup: jest.fn() }
        const { service, dataSource } = makeService({ mediaStorage })

        await expect(service.createUserPhotoMessage({
            userId: 'user-1',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
        })).rejects.toThrow('Idempotency-Key')
        await expect(service.createUserPhotoMessage({
            userId: 'user-1',
            sourceRequestId: 'not-a-uuid',
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
        })).rejects.toThrow('Idempotency-Key')
        expect(mediaStorage.write).not.toHaveBeenCalled()
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('returns an already-sent admin duplicate without a second Telegram send', async () => {
        const mediaStorage = { write: jest.fn(), read: jest.fn(), cleanup: jest.fn() }
        const { service, notificationService, existingAdminMessage } = makeService({ mediaStorage })
        existingAdminMessage.source = 'ADMIN_PANEL'
        existingAdminMessage.sourceRequestId = REQUEST_ID
        existingAdminMessage.telegramDeliveryStatus = SupportTelegramDeliveryStatusEnum.SENT
        ;(service as any).findPhotoDuplicate = jest.fn().mockResolvedValue(existingAdminMessage)

        const result = await service.createAdminPhotoReply({
            threadId: THREAD_ID,
            upload: { buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File,
            sourceRequestId: REQUEST_ID,
        })
        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(result.alreadySent).toBe(true)
        expect(mediaStorage.write).not.toHaveBeenCalled()
        expect(notificationService.notifyWithSupportMedia).not.toHaveBeenCalled()
    })

    it('uses the exact claim token for CAS finalization instead of unconditional save', async () => {
        const { service, supportMessageRepository } = makeService()
        const claimExecute = jest.fn().mockResolvedValue({ affected: 1, raw: [{ id: 'message-1' }] })
        const finalizeExecute = jest.fn().mockResolvedValue({ affected: 1, raw: [] })
        const makeUpdateBuilder = (execute: jest.Mock) => ({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            returning: jest.fn().mockReturnThis(),
            execute,
        })
        const claimBuilder = makeUpdateBuilder(claimExecute)
        const finalizeBuilder = makeUpdateBuilder(finalizeExecute)
        ;(supportMessageRepository.createQueryBuilder as jest.Mock)
            .mockImplementationOnce(() => claimBuilder)
            .mockImplementationOnce(() => finalizeBuilder)

        const result = await service.createAdminReply({
            threadId: THREAD_ID,
            text: 'Ответ с fencing-токеном.',
            source: 'ADMIN_BOT',
        })

        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(supportMessageRepository.save).not.toHaveBeenCalled()
        const claimedAt = claimBuilder.set.mock.calls[0][0].telegramDeliveryAttemptedAt
        expect(claimedAt).toBeInstanceOf(Date)
        expect(finalizeBuilder.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('telegram_delivery_attempted_at = :claimedAt'),
            expect.objectContaining({ claimedAt }),
        )
    })

    it('does not overwrite a newer claim when an old finalizer is fenced out', async () => {
        const { service, supportMessageRepository, notificationService, existingAdminMessage } = makeService()
        const claimExecute = jest.fn().mockResolvedValue({ affected: 1, raw: [{ id: 'message-1' }] })
        const finalizeExecute = jest.fn().mockResolvedValue({ affected: 0, raw: [] })
        const makeUpdateBuilder = (execute: jest.Mock) => ({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            returning: jest.fn().mockReturnThis(),
            execute,
        })
        ;(supportMessageRepository.createQueryBuilder as jest.Mock)
            .mockImplementationOnce(() => makeUpdateBuilder(claimExecute))
            .mockImplementationOnce(() => makeUpdateBuilder(finalizeExecute))
        ;(supportMessageRepository.findOne as jest.Mock)
            .mockResolvedValueOnce(existingAdminMessage)
            .mockResolvedValueOnce({
                ...existingAdminMessage,
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENT,
                telegramDeliveredAt: new Date(),
            })

        const result = await service.retryAdminDelivery('message-1')

        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(result.alreadySent).toBe(true)
        expect(notificationService.notify).toHaveBeenCalledTimes(1)
        expect(supportMessageRepository.save).not.toHaveBeenCalled()
    })

    it('uses one database transaction before notifying support about a customer message', async () => {
        const { service, dataSource, notificationService, managerThreadRepository } = makeService()

        const result = await service.createUserMessage({
            userId: 'user-1',
            text: 'Нужна помощь',
            source: 'TELEGRAM',
            sourceTelegramChatId: '42',
            sourceTelegramMessageId: '10',
        })

        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
        expect(managerThreadRepository.save).toHaveBeenCalledTimes(1)
        expect(notificationService.notify).toHaveBeenCalledTimes(2)
        expect(result.notification).toBe(SupportDeliveryStatus.SENT)
    })

    it('does not notify Telegram when message persistence rejects and lets the transaction fail', async () => {
        const { service, notificationService, managerThreadRepository } = makeService({
            messageInsertError: new Error('message write failed'),
        })

        await expect(
            service.createUserMessage({
                userId: 'user-1',
                text: 'Нужна помощь',
                source: 'TELEGRAM',
                sourceTelegramChatId: '42',
                sourceTelegramMessageId: '10',
            }),
        ).rejects.toThrow('message write failed')

        expect(managerThreadRepository.save).not.toHaveBeenCalled()
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('does not notify Telegram when thread persistence rejects after the message insert', async () => {
        const { service, notificationService, managerThreadRepository, messageInsert } = makeService({
            threadSaveError: new Error('thread write failed'),
        })

        await expect(
            service.createUserMessage({
                userId: 'user-1',
                text: 'Нужна помощь',
                source: 'TELEGRAM',
                sourceTelegramChatId: '42',
                sourceTelegramMessageId: '10',
            }),
        ).rejects.toThrow('thread write failed')

        expect(messageInsert.execute).toHaveBeenCalledTimes(1)
        expect(managerThreadRepository.save).toHaveBeenCalledTimes(1)
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('dedupes a re-delivered Telegram source message without another support notification', async () => {
        const { service, notificationService } = makeService({ duplicate: true })

        const result = await service.createUserMessage({
            userId: 'user-1',
            text: 'Нужна помощь',
            source: 'TELEGRAM',
            sourceTelegramChatId: '42',
            sourceTelegramMessageId: '10',
        })

        expect(result.notification).toBe(SupportDeliveryStatus.SKIPPED_DUPLICATE)
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('sends a persisted customer photo to the dedicated support chat and keeps the UUID reply action in metadata', async () => {
        const { service, notificationService } = makeService({ photo: true })

        const result = await service.createUserMessage({
            userId: 'user-1',
            text: 'Скриншот ошибки',
            source: 'TELEGRAM',
            contentKind: SupportMessageContentKindEnum.PHOTO,
            attachment: { telegramFileId: 'photo-file-id', telegramFileUniqueId: 'photo-unique' },
            sourceTelegramChatId: '42',
            sourceTelegramMessageId: '11',
        })

        expect(result.notification).toBe(SupportDeliveryStatus.SENT)
        expect(notificationService.notify).toHaveBeenCalledWith(
            '-100999',
            expect.stringContaining('Новое изображение в поддержку'),
            expect.objectContaining({ reply_markup: expect.anything() }),
        )
        expect(notificationService.notifyWithTelegramPhotoId).toHaveBeenCalledWith(
            '-100999',
            'photo-file-id',
            'Скриншот ошибки',
            expect.objectContaining({ reply_parameters: expect.anything() }),
        )
        expect(notificationService.notify.mock.invocationCallOrder[0]).toBeLessThan(
            notificationService.notifyWithTelegramPhotoId.mock.invocationCallOrder[0],
        )
    })

    it('sends support metadata before a customer text payload and returns PARTIAL without payload when delivery fails after metadata', async () => {
        const { service, notificationService } = makeService({ payloadError: new Error('payload failed') })

        const result = await service.createUserMessage({
            userId: 'user-1',
            text: 'Нужна помощь',
            source: 'TELEGRAM',
            sourceTelegramChatId: '42',
            sourceTelegramMessageId: '10',
        })

        expect(result.notification).toBe(SupportDeliveryStatus.PARTIAL)
        expect(notificationService.notify).toHaveBeenCalledTimes(2)
        expect(notificationService.notify.mock.calls[0][1]).toContain('Новое сообщение в поддержку')
        expect(notificationService.notify.mock.calls[1][1]).toBe('Нужна помощь')
        expect(notificationService.notify.mock.calls[1][2]).toEqual(expect.objectContaining({ reply_parameters: expect.anything() }))
    })

    it('does not send a customer payload when support metadata delivery fails', async () => {
        const { service, notificationService } = makeService({ metadataError: new Error('metadata failed') })

        const result = await service.createUserMessage({
            userId: 'user-1',
            text: 'Нужна помощь',
            source: 'TELEGRAM',
            sourceTelegramChatId: '42',
            sourceTelegramMessageId: '10',
        })

        expect(result.notification).toBe(SupportDeliveryStatus.FAILED)
        expect(notificationService.notify).toHaveBeenCalledTimes(1)
    })

    it('returns a truthful failed delivery result after an admin reply was persisted', async () => {
        const { service, notificationService, supportMessageRepository } = makeService({ notificationError: new Error('telegram rejected') })

        const result = await service.createAdminReply({
            threadId: THREAD_ID,
            text: 'Проверьте подключение ещё раз.',
            source: 'ADMIN_BOT',
            sourceTelegramChatId: '-100999',
            sourceTelegramMessageId: '12',
        })

        expect(result.delivery).toBe(SupportDeliveryStatus.FAILED)
        expect(notificationService.notify).toHaveBeenCalledTimes(1)
        expect(supportMessageRepository.createQueryBuilder).toHaveBeenCalled()
    })

    it('persists SENT and deliveredAt after the first successful admin delivery', async () => {
        const { service, supportMessageRepository } = makeService()

        const result = await service.createAdminReply({
            threadId: THREAD_ID,
            text: 'Ответ доставлен.',
            source: 'ADMIN_BOT',
        })

        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(supportMessageRepository.createQueryBuilder).toHaveBeenCalled()
    })

    it('persists SENT with a delivery timestamp and makes a successful retry one-shot', async () => {
        const { service, notificationService } = makeService({ adminDeliveryStatus: SupportTelegramDeliveryStatusEnum.FAILED })

        const first = await service.retryAdminDelivery('message-1')
        expect(first.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(first.alreadySent).toBeUndefined()
        expect(notificationService.notify).toHaveBeenCalledTimes(1)

        const second = await service.retryAdminDelivery('message-1')
        expect(second.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(second.alreadySent).toBe(true)
        expect(notificationService.notify).toHaveBeenCalledTimes(1)
    })

    it('does not send while another fresh SENDING claim is active', async () => {
        const { service, notificationService } = makeService({
            adminDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
            adminDeliveryAttemptedAt: new Date(),
            claimAffected: 0,
        })

        const result = await service.retryAdminDelivery('message-1')

        expect(result.inProgress).toBe(true)
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('reports already sent when a concurrent claim finishes before the loser reloads state', async () => {
        const { service, notificationService, supportMessageRepository, existingAdminMessage } = makeService({
            adminDeliveryStatus: SupportTelegramDeliveryStatusEnum.FAILED,
            claimAffected: 0,
        })
        ;(supportMessageRepository.findOne as jest.Mock)
            .mockResolvedValueOnce(existingAdminMessage)
            .mockResolvedValueOnce({ ...existingAdminMessage, telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENT })

        const result = await service.retryAdminDelivery('message-1')

        expect(result.alreadySent).toBe(true)
        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(notificationService.notify).not.toHaveBeenCalled()
        expect(supportMessageRepository.createQueryBuilder).toHaveBeenCalledTimes(1)
    })

    it('reclaims a stale SENDING claim before sending', async () => {
        const { service, notificationService } = makeService({
            adminDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
            adminDeliveryAttemptedAt: new Date(Date.now() - 6 * 60 * 1000),
        })

        const result = await service.retryAdminDelivery('message-1')

        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(notificationService.notify).toHaveBeenCalledTimes(1)
    })

    it('retries a stored admin photo using its persisted Telegram file id', async () => {
        const { service, notificationService } = makeService({ photo: true, adminDeliveryStatus: SupportTelegramDeliveryStatusEnum.FAILED })

        const result = await service.retryAdminDelivery('message-1')

        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(notificationService.notifyWithTelegramPhotoId).toHaveBeenCalledWith('42', 'photo-file-id', 'Сохранённый снимок')
    })

    it('resends a persisted admin photo reply to the user by Telegram file_id', async () => {
        const { service, notificationService } = makeService({ photo: true })

        const result = await service.createAdminReply({
            threadId: THREAD_ID,
            text: 'Проверьте этот экран.',
            source: 'ADMIN_BOT',
            contentKind: SupportMessageContentKindEnum.PHOTO,
            attachment: { telegramFileId: 'admin-photo-id', telegramFileUniqueId: 'admin-photo-unique' },
            sourceTelegramChatId: '-100999',
            sourceTelegramMessageId: '13',
        })

        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(notificationService.notifyWithTelegramPhotoId).toHaveBeenCalledWith('42', 'admin-photo-id', 'Проверьте этот экран.')
    })

    it('returns NO_TELEGRAM_ID after an admin reply was persisted for a user without a delivery channel', async () => {
        const { service, notificationService } = makeService({ noTelegramId: true })

        const result = await service.createAdminReply({
            threadId: THREAD_ID,
            text: 'Проверьте подключение ещё раз.',
            source: 'ADMIN_BOT',
            sourceTelegramChatId: '-100999',
            sourceTelegramMessageId: '12',
        })

        expect(result.delivery).toBe(SupportDeliveryStatus.NO_TELEGRAM_ID)
        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it('retries an existing failed admin reply without creating another support-history row', async () => {
        const { service, notificationService, messageInsert } = makeService()

        const result = await service.retryAdminDelivery('message-1')

        expect(result.delivery).toBe(SupportDeliveryStatus.SENT)
        expect(messageInsert.execute).not.toHaveBeenCalled()
        expect(notificationService.notify).toHaveBeenCalledTimes(1)
        expect(notificationService.notify).toHaveBeenCalledWith('42', 'Сохранённый ответ')
    })

    it.each([
        [null, null],
        [undefined, null],
        [0, 0],
        [123, 123],
        ['not-a-number', null],
        [Number.NaN, null],
        [Number.POSITIVE_INFINITY, null],
        [-1, null],
    ])('normalizes optional photo metadata %p to %p', (input, expected) => {
        const { service } = makeService()
        expect((service as any).normalizeOptionalNumber(input)).toBe(expected)
    })

    it('rejects Telegram support text longer than the public 4000-character limit', async () => {
        const { service } = makeService()
        await expect(
            service.createUserMessage({
                userId: 'user-1',
                text: 'x'.repeat(4001),
                source: 'TELEGRAM',
                sourceTelegramChatId: '42',
                sourceTelegramMessageId: '10',
            }),
        ).rejects.toBeDefined()
    })
})
