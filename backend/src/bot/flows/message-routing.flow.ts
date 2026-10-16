import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { SupportMessageContentKindEnum } from '../../support/entity/support.enum'
import { SupportDeliveryStatus } from '../../support/services/support.service'
import { BOT_CALLBACK } from '../bot.constants'
import { BotAuthStartFlow } from './auth-start.flow'

export abstract class BotMessageRoutingFlow extends BotAuthStartFlow {
    protected async handleSupportText(ctx: TelegrafContext) {
        const from = ctx.from
        if (!from) {
            return
        }

        const telegramUserId = String(from.id)
        if (this.adminBroadcastAwaitingUsers.has(telegramUserId) && this.isAdminTelegramUser(from.id)) {
            await this.captureAdminBroadcastDraft(ctx)
            return
        }

        const supportReplyThreadId = this.getStatelessAdminSupportReplyThreadId(ctx)
        if (supportReplyThreadId) {
            const adminMessage: any = ctx.message
            const adminText = adminMessage?.text?.trim()
            if (!adminText) {
                await ctx.reply(
                    'Сейчас поддерживаются только текстовые ответы. Ответьте на это же сообщение текстом.',
                )
                return
            }

            try {
                const result = await this.supportService.createAdminReply({
                    threadId: supportReplyThreadId,
                    text: adminText,
                    source: 'ADMIN_BOT',
                    contentKind: SupportMessageContentKindEnum.TEXT,
                    adminTelegramId: from.id,
                    ...this.getTelegramMessageSource(ctx),
                })
                await this.replyAdminDeliveryResult(ctx, result)
            } catch (error: any) {
                this.logger.error(
                    {
                        event: 'support_admin_reply_failed',
                        threadId: supportReplyThreadId,
                        adminTelegramId: String(from.id),
                        errorName: error instanceof Error ? error.name : 'UnknownError',
                    },
                    undefined,
                    'BotUpdate',
                )
                await ctx.reply(
                    'Не удалось отправить ответ. Попробуйте ещё раз, ответив на это же сообщение, или нажмите «Ответить» у обращения повторно.',
                )
            }
            return
        }

        const promoPlanCode = this.promoAwaitingUsers.get(telegramUserId)
        if (promoPlanCode) {
            const message: any = ctx.message
            const text = message?.text?.trim()
            if (this.isBotNavigationText(text)) {
                this.promoAwaitingUsers.delete(telegramUserId)
                return
            }

            if (!text) {
                await this.replyStyled(ctx, 'MENU_BUTTON_RENEW', 'Отправьте промокод текстом или нажмите «Назад».')
                return
            }

            this.promoAwaitingUsers.delete(telegramUserId)
            await this.openNavigationSection(ctx, 'renew', async () => {
                await this.beginExternalCheckout(ctx, promoPlanCode, text)
            })
            return
        }

        if (!this.isStatelessCustomerSupportReply(ctx)) {
            return
        }

        this.logger.log(
            `Support text received: ctx.from.id=${from.id} typeof=${typeof from.id} storedKey=${telegramUserId}`,
            'BotUpdate',
        )

        const message: any = ctx.message
        const text = message?.text?.trim()
        if (this.isBotNavigationText(text)) {
            return
        }

        if (!text) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Ответьте на сообщение поддержки текстом или одной фотографией.',
            )
            return
        }
        if (text.length > 4000) {
            await this.replyStyled(ctx, 'MENU_BUTTON_SUPPORT', 'Текст сообщения не должен быть длиннее 4000 символов.')
            return
        }

        try {
            const user = await this.ensureBotUser(ctx)
            const result = await this.supportService.createUserMessage({
                userId: user.id,
                text,
                source: 'TELEGRAM',
                contentKind: SupportMessageContentKindEnum.TEXT,
                ...this.getTelegramMessageSource(ctx),
            })
            this.logger.log(`Support send success for ${from.id}`, 'BotUpdate')
            await this.replyStyled(ctx, 'MENU_BUTTON_SUPPORT', this.userSupportDeliveryText(result.notification))
        } catch (error: any) {
            this.logger.error(
                {
                    event: 'support_user_message_persistence_failed',
                    telegramUserId: String(from.id),
                    errorName: error instanceof Error ? error.name : 'UnknownError',
                },
                'BotUpdate',
            )
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Не удалось отправить сообщение в поддержку. Попробуйте ещё раз позже.',
            )
        }
    }

    protected async handleSupportPhoto(ctx: TelegrafContext): Promise<boolean> {
        const supportReplyThreadId = this.getStatelessAdminSupportReplyThreadId(ctx)
        if (supportReplyThreadId) {
            if (this.isTelegramMediaGroup(ctx)) {
                await ctx.reply('Отправьте, пожалуйста, одну фотографию без альбома.')
                return true
            }
            const attachment = this.getTelegramPhotoAttachment(ctx)
            if (!attachment) {
                await ctx.reply('Сейчас в поддержке можно отправить только текст или одну фотографию с необязательной подписью.')
                return true
            }
            const from = ctx.from
            if (!from) return true
            const caption = String((ctx.message as any)?.caption || '').trim()
            if (caption.length > 1024) {
                await ctx.reply('Подпись к фотографии не должна быть длиннее 1024 символов.')
                return true
            }
            try {
                const result = await this.supportService.createAdminReply({
                    threadId: supportReplyThreadId,
                    text: caption || null,
                    source: 'ADMIN_BOT',
                    contentKind: SupportMessageContentKindEnum.PHOTO,
                    attachment,
                    adminTelegramId: from.id,
                    ...this.getTelegramMessageSource(ctx),
                })
                await this.replyAdminDeliveryResult(ctx, result)
            } catch (error: any) {
                this.logger.error(
                    {
                        event: 'support_admin_photo_reply_persistence_failed',
                        threadId: supportReplyThreadId,
                        adminTelegramId: String(from.id),
                        errorName: error instanceof Error ? error.name : 'UnknownError',
                    },
                    undefined,
                    'BotUpdate',
                )
                await ctx.reply('Не удалось сохранить ответ. Попробуйте ещё раз, ответив на это же сообщение.')
            }
            return true
        }

        const from = ctx.from
        const telegramUserId = from ? String(from.id) : ''
        if (!telegramUserId || !this.isStatelessCustomerSupportReply(ctx)) return false
        if (this.isTelegramMediaGroup(ctx)) {
            await this.replyStyled(ctx, 'MENU_BUTTON_SUPPORT', 'Отправьте, пожалуйста, одну фотографию без альбома.')
            return true
        }
        const attachment = this.getTelegramPhotoAttachment(ctx)
        if (!attachment) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Сейчас можно отправить только текст или одну фотографию с необязательной подписью.',
            )
            return true
        }
        const caption = String((ctx.message as any)?.caption || '').trim()
        if (caption.length > 1024) {
            await this.replyStyled(ctx, 'MENU_BUTTON_SUPPORT', 'Подпись к фотографии не должна быть длиннее 1024 символов.')
            return true
        }

        try {
            const user = await this.ensureBotUser(ctx)
            const result = await this.supportService.createUserMessage({
                userId: user.id,
                text: caption || null,
                source: 'TELEGRAM',
                contentKind: SupportMessageContentKindEnum.PHOTO,
                attachment,
                ...this.getTelegramMessageSource(ctx),
            })
            await this.replyStyled(ctx, 'MENU_BUTTON_SUPPORT', this.userSupportDeliveryText(result.notification))
        } catch (error: any) {
            this.logger.error(
                {
                    event: 'support_user_photo_persistence_failed',
                    telegramUserId,
                    errorName: error instanceof Error ? error.name : 'UnknownError',
                },
                undefined,
                'BotUpdate',
            )
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Не удалось отправить сообщение в поддержку. Попробуйте ещё раз позже.',
            )
        }
        return true
    }

    private adminReplyDeliveryText(delivery: SupportDeliveryStatus) {
        if (delivery === SupportDeliveryStatus.SENT) return 'Ответ отправлен пользователю и сохранён в истории поддержки.'
        if (delivery === SupportDeliveryStatus.NO_TELEGRAM_ID) {
            return 'Ответ сохранён в истории поддержки, но у пользователя нет доступного Telegram-канала для доставки.'
        }
        if (delivery === SupportDeliveryStatus.SKIPPED_DUPLICATE) {
            return 'Этот ответ уже сохранён в истории поддержки.'
        }
        return 'Ответ сохранён в истории поддержки, но доставить его пользователю не удалось.'
    }

    private async replyAdminDeliveryResult(ctx: TelegrafContext, result: { delivery: SupportDeliveryStatus; messageId?: string }) {
        const retryMessageId = String(result.messageId || '').trim()
        if (result.delivery === SupportDeliveryStatus.FAILED && retryMessageId) {
            await ctx.reply(
                this.adminReplyDeliveryText(result.delivery),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Повторить доставку', `${BOT_CALLBACK.SUPPORT_ADMIN_RETRY_PREFIX}${retryMessageId}`)],
                    ]) as any,
                ) as any,
            )
            return
        }
        await ctx.reply(this.adminReplyDeliveryText(result.delivery))
    }

    protected async retryAdminSupportDelivery(ctx: TelegrafContext, messageId: string) {
        try {
            const result = await this.supportService.retryAdminDelivery(messageId)
            if (result.inProgress) {
                await ctx.reply('Доставка уже выполняется. Подождите несколько секунд.')
            } else if (result.alreadySent) {
                await ctx.reply('Ответ уже был доставлен пользователю.')
            } else if (result.delivery === SupportDeliveryStatus.SENT) {
                await ctx.reply('Ответ успешно доставлен пользователю.')
                await this.clearAdminRetryMarkup(ctx)
            } else if (result.delivery === SupportDeliveryStatus.NO_TELEGRAM_ID) {
                await ctx.reply('У пользователя нет доступного Telegram-канала для доставки.')
            } else if (result.delivery === SupportDeliveryStatus.SKIPPED_DUPLICATE) {
                await ctx.reply('Этот ответ уже сохранён в истории поддержки.')
            } else {
                await ctx.reply('Повторная доставка не удалась.')
            }
        } catch (error: any) {
            this.logger.error(
                { event: 'support_admin_retry_failed', messageId, errorName: error instanceof Error ? error.name : 'UnknownError' },
                undefined,
                'BotUpdate',
            )
            await ctx.reply('Повторная доставка не удалась.')
        }
    }

    private async clearAdminRetryMarkup(ctx: TelegrafContext) {
        try {
            if (typeof (ctx as any).editMessageReplyMarkup === 'function') {
                await (ctx as any).editMessageReplyMarkup({ inline_keyboard: [] })
                return
            }
            const callbackMessage: any = (ctx as any).callbackQuery?.message
            const edit = (ctx as any).telegram?.editMessageReplyMarkup
            if (typeof edit === 'function' && callbackMessage?.chat?.id && callbackMessage?.message_id) {
                await edit.call(
                    (ctx as any).telegram,
                    callbackMessage.chat.id,
                    callbackMessage.message_id,
                    undefined,
                    { inline_keyboard: [] },
                )
            }
        } catch (error: any) {
            this.logger.warn(
                { event: 'support_admin_retry_markup_clear_failed', errorName: error instanceof Error ? error.name : 'UnknownError' },
                'BotUpdate',
            )
        }
    }

    private userSupportDeliveryText(notification: SupportDeliveryStatus) {
        if (notification === SupportDeliveryStatus.SENT) return 'Сообщение отправлено в поддержку. Обычно отвечаем в ближайшее время.'
        if (notification === SupportDeliveryStatus.SKIPPED_DUPLICATE) return 'Сообщение уже было отправлено в поддержку.'
        if (notification === SupportDeliveryStatus.PARTIAL) {
            return 'Сообщение сохранено, но уведомить поддержку полностью не удалось. Попробуйте позже.'
        }
        return 'Сообщение сохранено, но уведомить поддержку не удалось. Попробуйте позже.'
    }
}
