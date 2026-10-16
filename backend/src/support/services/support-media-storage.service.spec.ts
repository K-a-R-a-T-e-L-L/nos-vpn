import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { BadRequestException } from '@nestjs/common'

import { SupportMediaStorageService } from './support-media-storage.service'
import { validateSupportImageUpload } from './support-media.validation'

const PNG_1X1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082',
    'hex',
)

describe('SupportMediaStorageService', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'nosvpn-support-media-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('writes validated bytes under an opaque key and reads them back without a public URL', async () => {
        const storage = new SupportMediaStorageService({ get: jest.fn(() => root) } as any, { warn: jest.fn() } as any)
        const validated = validateSupportImageUpload({ buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File)

        const attachment = await storage.write(validated)
        const media = await storage.read(attachment.storageKey!)

        expect(attachment).toEqual(expect.objectContaining({
            storageProvider: 'FILESYSTEM',
            mimeType: 'image/png',
            byteSize: PNG_1X1.length,
            storageKey: expect.stringMatching(/^[0-9a-f-]{36}\.png$/),
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }))
        expect(media.buffer).toEqual(PNG_1X1)
        expect(media.mimeType).toBe('image/png')
        await expect(readFile(join(root, attachment.storageKey!))).resolves.toEqual(PNG_1X1)
    })

    it('rejects traversal keys and removes a task-owned object during cleanup', async () => {
        const storage = new SupportMediaStorageService({ get: jest.fn(() => root) } as any, { warn: jest.fn() } as any)
        const attachment = await storage.write(validateSupportImageUpload({ buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File))

        await expect(storage.read('../outside.png')).rejects.toBeInstanceOf(BadRequestException)
        await storage.cleanup(attachment.storageKey!)
        await expect(storage.read(attachment.storageKey!)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('derives image type from bytes and rejects unsupported or oversized files', () => {
        expect(validateSupportImageUpload({ buffer: PNG_1X1, size: PNG_1X1.length, mimetype: 'text/plain' } as Express.Multer.File).mimeType).toBe('image/png')
        expect(() => validateSupportImageUpload({ buffer: Buffer.from('<svg/>'), size: 6 } as Express.Multer.File)).toThrow(BadRequestException)
        expect(() => validateSupportImageUpload({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1), size: 10 * 1024 * 1024 + 1 } as Express.Multer.File)).toThrow(BadRequestException)
    })

    it('deduplicates bulk cleanup and continues after one invalid key', async () => {
        const logger = { warn: jest.fn() }
        const storage = new SupportMediaStorageService({ get: jest.fn(() => root) } as any, logger as any)
        const first = await storage.write(validateSupportImageUpload({ buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File))
        const second = await storage.write(validateSupportImageUpload({ buffer: PNG_1X1, size: PNG_1X1.length } as Express.Multer.File))

        await storage.cleanupMany([first.storageKey!, first.storageKey!, '../invalid', second.storageKey!])
        await expect(storage.read(first.storageKey!)).rejects.toBeInstanceOf(BadRequestException)
        await expect(storage.read(second.storageKey!)).rejects.toBeInstanceOf(BadRequestException)
        expect(logger.warn).toHaveBeenCalledTimes(1)
    })
})
