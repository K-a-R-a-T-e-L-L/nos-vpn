import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { BOT_CALLBACK } from '../bot.constants'
import { BotSupportFlow } from './support.flow'

export abstract class BotAdminBroadcastFlow extends BotSupportFlow {
    protected async enterAdminBroadcastMode(ctx: TelegrafContext) {
        const from = ctx.from
        if (!from || !this.isAdminTelegramUser(from.id)) {
            await ctx.reply('Команда доступна только администраторам.')
            return
        }

        const adminKey = String(from.id)
        this.promoAwaitingUsers.delete(adminKey)
        this.adminBroadcastDrafts.delete(adminKey)
        this.adminBroadcastAwaitingUsers.add(adminKey)

        await ctx.reply(
            [
                'Подготовка рассылки.',
                'Отправьте следующим сообщением пост, который нужно разослать пользователям.',
                'Можно отправить текст или сообщение с фото, видео, gif или документом. Бот покажет предпросмотр перед отправкой.',
            ].join('\n\n'),
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [Markup.button.callback('Отменить', BOT_CALLBACK.ADMIN_BROADCAST_CANCEL)],
                ]) as any,
            ) as any,
        )
    }

    protected async handleAdminBroadcastMediaDraft(ctx: TelegrafContext) {
        const from = ctx.from
        if (!from) {
            return
        }

        if (!this.adminBroadcastAwaitingUsers.has(String(from.id)) || !this.isAdminTelegramUser(from.id)) {
            return
        }

        await this.captureAdminBroadcastDraft(ctx)
    }

    protected async captureAdminBroadcastDraft(ctx: TelegrafContext) {
        const from = ctx.from
        const chatId = ctx.chat?.id
        const messageId = (ctx.message as any)?.message_id
        if (!from || !chatId || !messageId) {
            await ctx.reply('Не удалось сохранить сообщение для рассылки. Попробуйте ещё раз.')
            return
        }

        const adminKey = String(from.id)
        this.adminBroadcastAwaitingUsers.delete(adminKey)
        this.adminBroadcastDrafts.set(adminKey, {
            sourceChatId: chatId,
            sourceMessageId: messageId,
        })

        await ctx.reply('Ваш пост будет выглядеть так:')
        await this.bot.telegram.copyMessage(chatId, chatId, messageId)
        await ctx.reply(
            'Разослать это сообщение всем пользователям, которые запускали бота?',
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [Markup.button.callback('Разослать', BOT_CALLBACK.ADMIN_BROADCAST_SEND)],
                    [Markup.button.callback('Отменить', BOT_CALLBACK.ADMIN_BROADCAST_CANCEL)],
                ]) as any,
            ) as any,
        )
    }

    protected async sendAdminBroadcast(ctx: TelegrafContext) {
        const from = ctx.from
        if (!from || !this.isAdminTelegramUser(from.id)) {
            await ctx.reply('Команда доступна только администраторам.')
            return
        }

        const adminKey = String(from.id)
        const draft = this.adminBroadcastDrafts.get(adminKey)
        if (!draft) {
            await ctx.reply('Черновик рассылки не найден. Сначала отправьте /broadcast и подготовьте пост.')
            return
        }

        const recipients = await this.userService.findBroadcastRecipients()
        let sent = 0
        let failed = 0

        for (const user of recipients) {
            if (!user.telegramId) {
                continue
            }

            try {
                await this.bot.telegram.copyMessage(user.telegramId, draft.sourceChatId, draft.sourceMessageId)
                sent += 1
            } catch (error: any) {
                failed += 1
                this.logger.warn(
                    `Broadcast copy failed for telegramId=${user.telegramId}: ${error?.message || 'unknown'}`,
                    'BotUpdate',
                )
            }
        }

        this.adminBroadcastDrafts.delete(adminKey)
        this.adminBroadcastAwaitingUsers.delete(adminKey)

        await ctx.reply(['Рассылка завершена.', `Отправлено: ${sent}`, `Ошибок: ${failed}`].join('\n'))
    }
    protected async handleAdminBroadcastCancel(ctx: TelegrafContext) {
        await ctx.answerCbQuery()

        if (!ctx.from) {
            return
        }

        const adminKey = String(ctx.from.id)
        this.adminBroadcastAwaitingUsers.delete(adminKey)
        this.adminBroadcastDrafts.delete(adminKey)
        await ctx.reply('Рассылка отменена.')
    }
}
