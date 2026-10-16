import { existsSync } from 'fs'

import { Injectable } from '@nestjs/common'
import { InjectBot } from 'nestjs-telegraf'
import { Input, Telegraf } from 'telegraf'
import { FmtString } from 'telegraf/format'

import { SUPPORT_MEDIA_MAX_BYTES } from '../support/services/support-media.validation'

@Injectable()
export class NotificationService {
    constructor(@InjectBot() private readonly bot: Telegraf) {
    }

    async notify(chatId: string | number, message: string | FmtString, extra: Record<string, any> = {}) {
        return await this.bot.telegram.sendMessage(chatId, message as any, extra as any)
    }

    async notifyWithPhoto(
        chatId: string | number,
        photoPath: string | null | undefined,
        caption: string,
        extra: Record<string, any> = {},
    ) {
        if (!photoPath || !existsSync(photoPath)) {
            return this.notify(chatId, caption, extra)
        }

        return await this.bot.telegram.sendPhoto(chatId, Input.fromLocalFile(photoPath), {
            caption,
            ...extra,
        } as any)
    }

    async notifyWithTelegramPhotoId(
        chatId: string | number,
        telegramFileId: string,
        caption?: string | null,
        extra: Record<string, any> = {},
    ) {
        return await this.bot.telegram.sendPhoto(chatId, telegramFileId, {
            ...(caption ? { caption } : {}),
            ...extra,
        } as any)
    }

    async notifyWithSupportMedia(
        chatId: string | number,
        buffer: Buffer,
        filename: string,
        caption?: string | null,
        extra: Record<string, any> = {},
    ) {
        return await this.bot.telegram.sendPhoto(chatId, Input.fromBuffer(buffer, filename), {
            ...(caption ? { caption } : {}),
            ...extra,
        } as any)
    }

    async downloadTelegramPhoto(telegramFileId: string): Promise<Buffer> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
            const url = await this.bot.telegram.getFileLink(telegramFileId)
            const response = await fetch(url, { signal: controller.signal })
            if (!response.ok || !response.body) throw new Error('Telegram media is unavailable')
            const declaredLength = Number(response.headers.get('content-length') || 0)
            if (declaredLength > SUPPORT_MEDIA_MAX_BYTES) throw new Error('Telegram media exceeds the allowed size')
            const reader = response.body.getReader()
            const chunks: Uint8Array[] = []
            let size = 0
            while (true) {
                const next = await reader.read()
                if (next.done) break
                size += next.value.byteLength
                if (size > SUPPORT_MEDIA_MAX_BYTES) {
                    await reader.cancel()
                    throw new Error('Telegram media exceeds the allowed size')
                }
                chunks.push(next.value)
            }
            return Buffer.concat(chunks)
        } finally {
            clearTimeout(timeout)
        }
    }

    async sendVideo(chatId: string | number, videoUrl: string, caption?: string) {
        return await this.bot.telegram.sendVideo(chatId, videoUrl, {
            caption,
            supports_streaming: true,
        })
    }
}
