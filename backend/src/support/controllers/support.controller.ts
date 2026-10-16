import { Body, Controller, Get, Param, Post, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { CreateSupportMessageDto } from '../dto/create-support-message.dto'
import { SUPPORT_MEDIA_MAX_BYTES } from '../services/support-media.validation'
import { SupportService } from '../services/support.service'

@Controller('support')
@ApiTags('Support')
export class SupportController {
    constructor(private readonly supportService: SupportService) {}

    @Get('me')
    @UserAuth(UserAuthType.USER)
    async getCurrentThread(@UserDecorator() user: User) {
        return this.supportService.getCurrentUserThread(user.id)
    }

    @Post('message')
    @UserAuth(UserAuthType.USER)
    async createMessage(@UserDecorator() user: User, @Body() dto: CreateSupportMessageDto) {
        const result = await this.supportService.createUserMessage({
            userId: user.id,
            text: dto.text,
            source: 'WEBSITE',
        })
        return result.thread
    }

    @Post('message/photo')
    @UserAuth(UserAuthType.USER)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: SUPPORT_MEDIA_MAX_BYTES } }))
    @ApiConsumes('multipart/form-data')
    @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID v4 request identity for safe photo retries' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['image'],
            properties: {
                image: { type: 'string', format: 'binary' },
                text: { type: 'string', maxLength: 1024 },
            },
        },
    })
    async createPhotoMessage(
        @UserDecorator() user: User,
        @UploadedFile() image: Express.Multer.File,
        @Body('text') text: string | undefined,
        @Req() request: Request,
    ) {
        const idempotencyKey = typeof request.headers['idempotency-key'] === 'string' ? request.headers['idempotency-key'] : ''
        const result = await this.supportService.createUserPhotoMessage({ userId: user.id, text, upload: image, sourceRequestId: idempotencyKey || '' })
        return { thread: result.thread, notification: result.notification }
    }

    @Get('messages/:messageId/media')
    @UserAuth(UserAuthType.USER)
    @ApiProduces('image/jpeg', 'image/png', 'image/webp')
    @ApiOkResponse({
        description: 'Private support photo bytes',
        content: {
            'image/jpeg': { schema: { type: 'string', format: 'binary' } },
            'image/png': { schema: { type: 'string', format: 'binary' } },
            'image/webp': { schema: { type: 'string', format: 'binary' } },
        },
    })
    @ApiNotFoundResponse({ description: 'Support media is unavailable' })
    async getMessageMedia(@UserDecorator() user: User, @Param('messageId') messageId: string, @Res({ passthrough: true }) response: Response) {
        const media = await this.supportService.getMediaForUser(user.id, messageId)
        response.setHeader('Cache-Control', 'private, no-store')
        return new StreamableFile(media.buffer, {
            type: media.mimeType,
            disposition: 'inline',
            length: media.byteSize,
        })
    }
}
