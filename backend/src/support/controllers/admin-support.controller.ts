import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { AdminReplySupportDto } from '../dto/admin-reply-support.dto'
import { SUPPORT_MEDIA_MAX_BYTES } from '../services/support-media.validation'
import { SupportService } from '../services/support.service'

@Controller('admin/support')
@ApiTags('Admin support')
export class AdminSupportController {
    constructor(private readonly supportService: SupportService) {}

    @Get('threads')
    @UserAuth(UserAuthType.ADMIN)
    async listThreads(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.supportService.listAdminThreads(search, Number(page) || 1, Number(pageSize) || 20)
    }

    @Get('threads/:id')
    @UserAuth(UserAuthType.ADMIN)
    async getThread(@Param('id') id: string) {
        return this.supportService.getAdminThread(id)
    }

    @Post('threads/:id/reply')
    @UserAuth(UserAuthType.ADMIN)
    async reply(
        @Param('id') id: string,
        @UserDecorator() admin: User,
        @Body() dto: AdminReplySupportDto,
    ) {
        const result = await this.supportService.createAdminReply({
            threadId: id,
            text: dto.text,
            source: 'ADMIN_PANEL',
            adminUserId: admin.id,
            adminTelegramId: admin.telegramId,
        })
        return { thread: result.thread, delivery: result.delivery }
    }

    @Post('threads/:threadId/reply/photo')
    @UserAuth(UserAuthType.ADMIN)
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
    async replyPhoto(
        @Param('threadId') threadId: string,
        @UserDecorator() admin: User,
        @UploadedFile() image: Express.Multer.File,
        @Body('text') text: string | undefined,
        @Req() request: Request,
    ) {
        const idempotencyKey = typeof request.headers['idempotency-key'] === 'string' ? request.headers['idempotency-key'] : ''
        const result = await this.supportService.createAdminPhotoReply({
            threadId,
            text,
            upload: image,
            adminUserId: admin.id,
            adminTelegramId: admin.telegramId,
            sourceRequestId: idempotencyKey || '',
        })
        return { thread: result.thread, delivery: result.delivery, messageId: result.messageId }
    }

    @Get('messages/:messageId/media')
    @UserAuth(UserAuthType.ADMIN)
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
    async getMessageMedia(@Param('messageId') messageId: string, @Res({ passthrough: true }) response: Response) {
        const media = await this.supportService.getMediaForAdmin(messageId)
        response.setHeader('Cache-Control', 'private, no-store')
        return new StreamableFile(media.buffer, {
            type: media.mimeType,
            disposition: 'inline',
            length: media.byteSize,
        })
    }

    @Patch('threads/:id/close')
    @UserAuth(UserAuthType.ADMIN)
    async closeThread(@Param('id') id: string) {
        return this.supportService.closeThread(id)
    }
}
