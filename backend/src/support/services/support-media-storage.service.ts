import { createHash, randomUUID } from 'crypto'
import { constants } from 'fs'
import { access, lstat, mkdir, open, readFile, rename, rm } from 'fs/promises'
import { basename, dirname, isAbsolute, resolve } from 'path'

import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { ValidatedSupportImageUpload } from './support-media.validation'
import { TelegramLoggerService } from '../../logger/logger.service'
import type { SupportPhotoAttachment } from '../entity/support-message.entity'

export type StoredSupportMedia = {
    buffer: Buffer
    mimeType: NonNullable<SupportPhotoAttachment['mimeType']>
    byteSize: number
}

@Injectable()
export class SupportMediaStorageService {
    constructor(
        private readonly configService: ConfigService,
        private readonly logger: TelegramLoggerService,
    ) {}

    async write(image: ValidatedSupportImageUpload): Promise<SupportPhotoAttachment> {
        const root = await this.resolveRoot()
        const storageKey = `${randomUUID()}.${image.extension}`
        const target = this.resolveStoragePath(root, storageKey)
        const temporary = resolve(root, `.${randomUUID()}.tmp`)
        try {
            const handle = await open(temporary, 'wx', 0o600)
            try {
                await handle.writeFile(image.buffer)
                await handle.sync()
            } finally {
                await handle.close()
            }
            await rename(temporary, target)
            return {
                storageProvider: 'FILESYSTEM',
                storageKey,
                mimeType: image.mimeType,
                byteSize: image.byteSize,
                sha256: createHash('sha256').update(image.buffer).digest('hex'),
                width: image.width || null,
                height: image.height || null,
                fileSize: image.byteSize,
            }
        } catch (error) {
            await rm(temporary, { force: true }).catch(() => undefined)
            throw error
        }
    }

    async read(storageKey: string): Promise<StoredSupportMedia> {
        const root = await this.resolveRoot()
        const path = this.resolveStoragePath(root, storageKey)
        try {
            const metadata = await lstat(path)
            if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('invalid private media object')
            const buffer = await readFile(path)
            if (!buffer.length) throw new Error('empty private media object')
            const mimeType = this.mimeTypeFromKey(storageKey)
            return { buffer, mimeType, byteSize: buffer.length }
        } catch {
            throw new BadRequestException('Support media is unavailable')
        }
    }

    async cleanup(storageKey?: string | null) {
        if (!storageKey) return
        try {
            const root = await this.resolveRoot()
            await rm(this.resolveStoragePath(root, storageKey), { force: true })
        } catch (error: any) {
            this.logger.warn({ event: 'support_media_cleanup_failed', errorName: error instanceof Error ? error.name : 'UnknownError' }, SupportMediaStorageService.name)
        }
    }

    async cleanupMany(storageKeys: Iterable<string>) {
        const uniqueKeys = new Set<string>()
        for (const key of storageKeys) {
            if (String(key || '').trim()) uniqueKeys.add(String(key).trim())
        }
        for (const key of uniqueKeys) await this.cleanup(key)
    }

    private async resolveRoot() {
        const configured = String(this.configService.get<string>('SUPPORT_MEDIA_STORAGE_ROOT') || '').trim()
        if (!configured || !isAbsolute(configured)) {
            throw new ServiceUnavailableException('Support media storage is not configured')
        }
        const root = resolve(configured)
        try {
            await mkdir(root, { recursive: true, mode: 0o700 })
            await access(root, constants.R_OK | constants.W_OK)
            const metadata = await lstat(root)
            if (!metadata.isDirectory()) throw new Error('not a directory')
            return root
        } catch {
            throw new ServiceUnavailableException('Support media storage is unavailable')
        }
    }

    private resolveStoragePath(root: string, storageKey: string) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(storageKey)) {
            throw new BadRequestException('Invalid support media key')
        }
        const path = resolve(root, storageKey)
        if (dirname(path) !== root || basename(path) !== storageKey) {
            throw new BadRequestException('Invalid support media key')
        }
        return path
    }

    private mimeTypeFromKey(storageKey: string): StoredSupportMedia['mimeType'] {
        if (storageKey.endsWith('.jpg')) return 'image/jpeg'
        if (storageKey.endsWith('.png')) return 'image/png'
        if (storageKey.endsWith('.webp')) return 'image/webp'
        throw new BadRequestException('Invalid support media key')
    }
}
