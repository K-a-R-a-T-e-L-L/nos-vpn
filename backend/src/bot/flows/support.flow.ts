import { isUUID } from 'class-validator'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { tgEmoji } from '../custom-emoji.registry'
import { buildCustomerSupportPrompt, buildSupportAdminReplyPrompt } from '../support-admin-reply'
import { BotInfoFlow } from './info.flow'

export abstract class BotSupportFlow extends BotInfoFlow {
    protected async enterSupportMode(ctx: TelegrafContext) {
        if (!ctx.from) {
            return
        }
        this.promoAwaitingUsers.delete(String(ctx.from.id))
        await ctx.reply(
            buildCustomerSupportPrompt(),
            this.htmlReplyOptions({ reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Опишите проблему' } }) as any,
        )
    }
    protected async handleSupportAdminReplyStart(ctx: TelegrafContext) {
        const from = ctx.from
        const match = (ctx as any).match as RegExpExecArray | undefined
        const threadId = String(match?.[1] || '').trim()
        const callbackMessage: any = (ctx.callbackQuery as any)?.message
        const chatId = callbackMessage?.chat?.id

        if (!from || !this.isAdminTelegramUser(from.id) || !this.isSupportChat(chatId) || !isUUID(threadId)) {
            await ctx.answerCbQuery('Действие недоступно.', { show_alert: true } as any)
            this.logger.warn('event=support_admin_reply_start_rejected resultCode=INVALID_CONTEXT', 'BotUpdate')
            return
        }

        await ctx.answerCbQuery()
        await ctx.reply(
            buildSupportAdminReplyPrompt(threadId),
            this.htmlReplyOptions(
                { reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Введите ответ пользователю' } },
            ) as any,
        )
    }
}
