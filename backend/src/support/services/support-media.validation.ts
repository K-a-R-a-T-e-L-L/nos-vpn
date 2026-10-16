import { BadRequestException } from '@nestjs/common'

export const SUPPORT_MEDIA_MAX_BYTES = 10 * 1024 * 1024
export const SUPPORT_MEDIA_MAX_PIXELS = 40_000_000

export type SupportImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export type ValidatedSupportImageUpload = {
    buffer: Buffer
    mimeType: SupportImageMimeType
    byteSize: number
    extension: 'jpg' | 'png' | 'webp'
    width?: number | null
    height?: number | null
}

export function validateSupportImageUpload(file?: Express.Multer.File | null): ValidatedSupportImageUpload {
    const buffer = file?.buffer
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new BadRequestException('A support image is required')
    }
    if (buffer.length > SUPPORT_MEDIA_MAX_BYTES) {
        throw new BadRequestException('Support image exceeds the 10 MiB limit')
    }

    const detected = detectSupportImage(buffer)
    if (!detected) {
        throw new BadRequestException('Only JPEG, PNG, and WebP support images are allowed')
    }
    if (detected.width && detected.height && detected.width * detected.height > SUPPORT_MEDIA_MAX_PIXELS) {
        throw new BadRequestException('Support image dimensions exceed the allowed limit')
    }
    return { buffer, byteSize: buffer.length, ...detected }
}

function detectSupportImage(buffer: Buffer): Omit<ValidatedSupportImageUpload, 'buffer' | 'byteSize'> | null {
    const png = parsePng(buffer)
    if (png) return { mimeType: 'image/png', extension: 'png', ...png }
    const jpeg = parseJpeg(buffer)
    if (jpeg) return { mimeType: 'image/jpeg', extension: 'jpg', ...jpeg }
    const webp = parseWebp(buffer)
    if (webp) return { mimeType: 'image/webp', extension: 'webp', ...webp }
    return null
}

function parsePng(buffer: Buffer): { width: number; height: number } | null {
    const signature = '89504e470d0a1a0a'
    if (buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== signature) return null
    if (buffer.readUInt32BE(8) !== 13 || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return width > 0 && height > 0 ? { width, height } : null
}

function parseJpeg(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 10 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
    let offset = 2
    while (offset + 8 <= buffer.length) {
        while (offset < buffer.length && buffer[offset] === 0xff) offset += 1
        const marker = buffer[offset]
        offset += 1
        if (!marker || marker === 0xd9 || marker === 0xda) return null
        if (marker >= 0xd0 && marker <= 0xd7) continue
        if (offset + 2 > buffer.length) return null
        const length = buffer.readUInt16BE(offset)
        if (length < 2 || offset + length > buffer.length) return null
        const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)
        if (isStartOfFrame) {
            if (length < 8) return null
            const height = buffer.readUInt16BE(offset + 3)
            const width = buffer.readUInt16BE(offset + 5)
            return width > 0 && height > 0 ? { width, height } : null
        }
        offset += length
    }
    return null
}

function parseWebp(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 30 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null
    const declaredSize = buffer.readUInt32LE(4) + 8
    if (declaredSize !== buffer.length) return null
    const chunkType = buffer.subarray(12, 16).toString('ascii')
    const chunkLength = buffer.readUInt32LE(16)
    if (20 + chunkLength > buffer.length) return null
    if (chunkType === 'VP8X' && chunkLength >= 10) {
        return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 }
    }
    if (chunkType === 'VP8 ' && chunkLength >= 10 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
    }
    if (chunkType === 'VP8L' && chunkLength >= 5 && buffer[20] === 0x2f) {
        const value = buffer.readUInt32LE(21)
        return { width: (value & 0x3fff) + 1, height: ((value >> 14) & 0x3fff) + 1 }
    }
    return null
}

function readUInt24LE(buffer: Buffer, offset: number) {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}
