import { NotFoundException } from '@nestjs/common'

import { SupportService } from './support.service'
import { SupportMessageContentKindEnum } from '../entity/support.enum'

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111'
const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082', 'hex')

function makeService(options: { message?: any; legacyBuffer?: Buffer; storageError?: boolean } = {}) {
    const message = Object.prototype.hasOwnProperty.call(options, 'message') ? options.message : {
        id: MESSAGE_ID,
        contentKind: SupportMessageContentKindEnum.PHOTO,
        attachment: { storageProvider: 'FILESYSTEM', storageKey: '11111111-1111-4111-8111-111111111111.png', mimeType: 'image/png', byteSize: PNG_1X1.length },
    }
    const query = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(message),
    }
    const messages = {
        createQueryBuilder: jest.fn().mockReturnValue(query),
        findOne: jest.fn().mockResolvedValue(message),
    }
    const mediaStorage = {
        read: jest.fn(options.storageError ? async () => { throw new Error('missing') } : async () => ({ buffer: PNG_1X1, mimeType: 'image/png', byteSize: PNG_1X1.length })),
    }
    const notification = { downloadTelegramPhoto: jest.fn().mockResolvedValue(options.legacyBuffer || PNG_1X1) }
    const service = new SupportService(
        {} as any,
        messages as any,
        {} as any,
        notification as any,
        {} as any,
        { warn: jest.fn(), error: jest.fn() } as any,
        {} as any,
        mediaStorage as any,
    )
    return { service, query, messages, mediaStorage, notification }
}

describe('Support media read authorization and privacy', () => {
    it('reads a storage-backed PHOTO only through the owner-scoped query', async () => {
        const { service, query, mediaStorage } = makeService()

        await expect(service.getMediaForUser('user-1', MESSAGE_ID)).resolves.toEqual({ buffer: PNG_1X1, mimeType: 'image/png', byteSize: PNG_1X1.length })
        expect(query.andWhere).toHaveBeenCalledWith('thread.user_id = :userId', { userId: 'user-1' })
        expect(mediaStorage.read).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111.png')
    })

    it('does not reveal another user or a TEXT message as media', async () => {
        const foreign = makeService({ message: null })
        await expect(foreign.service.getMediaForUser('user-2', MESSAGE_ID)).rejects.toBeInstanceOf(NotFoundException)

        const text = makeService({ message: { id: MESSAGE_ID, contentKind: SupportMessageContentKindEnum.TEXT, attachment: null } })
        await expect(text.service.getMediaForAdmin(MESSAGE_ID)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('uses the backend Telegram boundary for legacy file-id rows and keeps private attachment metadata out of mapMessage', async () => {
        const { service, notification } = makeService({
            message: {
                id: MESSAGE_ID,
                contentKind: SupportMessageContentKindEnum.PHOTO,
                attachment: { telegramFileId: 'private-file-id', telegramFileUniqueId: 'private-unique-id' },
            },
        })

        await expect(service.getMediaForAdmin(MESSAGE_ID)).resolves.toEqual({ buffer: PNG_1X1, mimeType: 'image/png', byteSize: PNG_1X1.length })
        expect(notification.downloadTelegramPhoto).toHaveBeenCalledWith('private-file-id')
        expect((service as any).mapMessage({ id: MESSAGE_ID, threadId: 'thread', userId: 'user', authorType: 'USER', source: 'TELEGRAM', contentKind: SupportMessageContentKindEnum.PHOTO, attachment: { telegramFileId: 'private-file-id', storageKey: 'private-key' }, text: null, createdAt: new Date() })).not.toHaveProperty('attachment')
    })

    it('returns a safe unavailable response when legacy proxy or private storage fails', async () => {
        const legacy = makeService({ message: { id: MESSAGE_ID, contentKind: SupportMessageContentKindEnum.PHOTO, attachment: { telegramFileId: 'private-file-id' } }, legacyBuffer: Buffer.from('not-an-image') })
        await expect(legacy.service.getMediaForAdmin(MESSAGE_ID)).rejects.toBeInstanceOf(NotFoundException)

        const stored = makeService({ storageError: true })
        await expect(stored.service.getMediaForAdmin(MESSAGE_ID)).rejects.toBeInstanceOf(NotFoundException)
    })
})
