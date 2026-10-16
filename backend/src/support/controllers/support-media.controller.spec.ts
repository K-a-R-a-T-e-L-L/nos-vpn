import { AdminSupportController } from './admin-support.controller'
import { SupportController } from './support.controller'

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111'
const PHOTO = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082', 'hex')

function response() {
    return { setHeader: jest.fn() } as any
}

describe('private support-media HTTP boundaries', () => {
    it('passes a user upload only to the server-owned photo workflow and returns its safe delivery result', async () => {
        const service = {
            createUserPhotoMessage: jest.fn().mockResolvedValue({ thread: { id: 'thread-1' }, notification: 'SENT' }),
            getMediaForUser: jest.fn().mockResolvedValue({ buffer: PHOTO, mimeType: 'image/png', byteSize: PHOTO.length }),
        }
        const controller = new SupportController(service as any)
        const user = { id: 'user-1' } as any
        const upload = { buffer: PHOTO, size: PHOTO.length, mimetype: 'image/png' } as any

        await expect(controller.createPhotoMessage(user, upload, 'подпись', { headers: { 'idempotency-key': '11111111-1111-4111-8111-111111111111' } } as any)).resolves.toEqual({ thread: { id: 'thread-1' }, notification: 'SENT' })
        expect(service.createUserPhotoMessage).toHaveBeenCalledWith({ userId: 'user-1', text: 'подпись', upload, sourceRequestId: '11111111-1111-4111-8111-111111111111' })

        const reply = response()
        const stream = await controller.getMessageMedia(user, MESSAGE_ID, reply)
        expect(service.getMediaForUser).toHaveBeenCalledWith('user-1', MESSAGE_ID)
        expect(reply.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
        expect(stream).toBeDefined()
    })

    it('keeps the admin upload/read boundary ADMIN-scoped and does not expose storage metadata', async () => {
        const service = {
            createAdminPhotoReply: jest.fn().mockResolvedValue({ thread: { id: 'thread-1' }, delivery: 'SENT', messageId: MESSAGE_ID }),
            getMediaForAdmin: jest.fn().mockResolvedValue({ buffer: PHOTO, mimeType: 'image/png', byteSize: PHOTO.length }),
        }
        const controller = new AdminSupportController(service as any)
        const admin = { id: 'admin-1', telegramId: 123 } as any
        const upload = { buffer: PHOTO, size: PHOTO.length, mimetype: 'image/png' } as any

        await expect(controller.replyPhoto('thread-1', admin, upload, 'ответ', { headers: { 'idempotency-key': '22222222-2222-4222-8222-222222222222' } } as any)).resolves.toEqual({ thread: { id: 'thread-1' }, delivery: 'SENT', messageId: MESSAGE_ID })
        expect(service.createAdminPhotoReply).toHaveBeenCalledWith({
            threadId: 'thread-1',
            text: 'ответ',
            upload,
            adminUserId: 'admin-1',
            adminTelegramId: 123,
            sourceRequestId: '22222222-2222-4222-8222-222222222222',
        })

        const reply = response()
        const stream = await controller.getMessageMedia(MESSAGE_ID, reply)
        expect(service.getMediaForAdmin).toHaveBeenCalledWith(MESSAGE_ID)
        expect(reply.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
        expect(stream).toBeDefined()
    })
})
