import { NotificationService } from './notification.service'
import { SUPPORT_MEDIA_MAX_BYTES } from '../support/services/support-media.validation'

const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082', 'hex')

describe('NotificationService legacy Telegram media boundary', () => {
    const originalFetch = global.fetch

    afterEach(() => {
        global.fetch = originalFetch
    })

    it('downloads legacy media server-side with no browser URL and bounded bytes', async () => {
        const getFileLink = jest.fn().mockResolvedValue(new URL('https://telegram.example/private-file'))
        const service = new NotificationService({ telegram: { getFileLink } } as any)
        const fetchMock = jest.fn().mockResolvedValue(new Response(PNG_1X1, { status: 200 }))
        global.fetch = fetchMock as any

        await expect(service.downloadTelegramPhoto('private-file-id')).resolves.toEqual(PNG_1X1)
        expect(getFileLink).toHaveBeenCalledWith('private-file-id')
        expect(fetchMock).toHaveBeenCalledWith(new URL('https://telegram.example/private-file'), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    })

    it('rejects an oversized legacy response before buffering it', async () => {
        const service = new NotificationService({ telegram: { getFileLink: jest.fn().mockResolvedValue(new URL('https://telegram.example/private-file')) } } as any)
        global.fetch = jest.fn().mockResolvedValue(new Response('x', {
            status: 200,
            headers: { 'content-length': String(SUPPORT_MEDIA_MAX_BYTES + 1) },
        })) as any

        await expect(service.downloadTelegramPhoto('private-file-id')).rejects.toThrow('allowed size')
    })
})
