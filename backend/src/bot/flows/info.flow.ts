import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { buildEmojiCheckReport, extractCustomEmojiItemsFromMessage, getCustomEmojiRefs } from '../bot-emoji-diagnostics'
import { buildBotLegalButtonRows, buildBotLegalInfoText } from '../bot-legal'
import { tgEmoji } from '../custom-emoji.registry'
import { BotNavigationFlow } from './navigation.flow'

export abstract class BotInfoFlow extends BotNavigationFlow {
    protected async showFaq(ctx: TelegrafContext) {
        const legalKeyboard = Markup.inlineKeyboard(buildBotLegalButtonRows()) as any
        try {
            await ctx.reply(this.buildFormattedFaqMessage(), this.htmlReplyOptions(legalKeyboard) as any)
        } catch (error: any) {
            this.logger.error(
                `Formatted FAQ message failed: ${error?.message || 'unknown'}; stack=${error?.stack || 'n/a'}`,
                'BotUpdate',
            )
            await ctx.reply(this.buildSafeFaqMessage(), legalKeyboard)
        }
    }

    protected buildFormattedFaqMessage() {
        return [
            `${tgEmoji('FAQ_TITLE')} Частые вопросы`,
            `${tgEmoji('FAQ_1')} <i>Как подключиться?</i>\n<blockquote>Откройте «Тарифы», выберите вариант и получите ссылку доступа. По ней откроется страница подписки с инструкцией и списком подходящих клиентов.</blockquote>`,
            `${tgEmoji('FAQ_2')} <i>Есть бесплатный пробный период?</i>\n<blockquote>Да. 3 дня на тариф с 1 устройством. Он доступен один раз.</blockquote>`,
            `${tgEmoji('FAQ_3')} <i>Как продлить подписку?</i>\n<blockquote>Нажмите «Продлить». Если оплата пока недоступна, напишите в поддержку — подскажем, что делать.</blockquote>`,
            `${tgEmoji('FAQ_4')} <i>Что будет после окончания срока?</i>\n<blockquote>Доступ работает ещё 24 часа, чтобы вы успели продлить подписку.</blockquote>`,
            `${tgEmoji('FAQ_5')} <i>Не получилось подключиться. Что делать?</i>\n<blockquote>Откройте страницу подписки и проверьте инструкцию. Если не помогло — напишите в поддержку прямо здесь.</blockquote>`,
            `${tgEmoji('FAQ_6')} <i>Какой клиент использовать?</i>\n<blockquote>Для быстрого старта рекомендуем Happ. Также можно использовать другие совместимые клиенты со страницы подписки.</blockquote>`,
            `${tgEmoji('FAQ_7')} <i>Как добавить доступ?</i>\n<blockquote>Откройте свою ссылку подписки, выберите подходящий клиент и следуйте инструкции на странице.</blockquote>`,
            `${tgEmoji('FAQ_DOCS')} <i>Документы и контакты</i>\nОткройте раздел «Информация» или команду /info.`,
        ].join('\n\n')
    }

    protected buildSafeFaqMessage() {
        return [
            'Частые вопросы',
            '1. Как подключиться?\nОткройте «Тарифы», выберите вариант и получите ссылку доступа. По ней откроется страница подписки с инструкцией и списком подходящих клиентов.',
            '2. Есть бесплатный пробный период?\nДа. 3 дня на тариф с 1 устройством. Он доступен один раз.',
            '3. Как продлить подписку?\nНажмите «Продлить». Если оплата пока недоступна, напишите в поддержку — подскажем, что делать.',
            '4. Что будет после окончания срока?\nДоступ работает ещё 24 часа, чтобы вы успели продлить подписку.',
            '5. Не получилось подключиться. Что делать?\nОткройте страницу подписки и проверьте инструкцию. Если не помогло — напишите в поддержку прямо здесь.',
            '6. Какой клиент использовать?\nДля быстрого старта рекомендуем Happ. Также можно использовать другие совместимые клиенты со страницы подписки.',
            '7. Как добавить доступ?\nОткройте свою ссылку подписки, выберите подходящий клиент и следуйте инструкции на странице.',
            'Документы и контакты\nОткройте раздел «Информация» или команду /info.',
        ].join('\n\n')
    }

    protected async showInfo(ctx: TelegrafContext) {
        await ctx.reply(
            buildBotLegalInfoText(),
            this.htmlReplyOptions(Markup.inlineKeyboard(buildBotLegalButtonRows()) as any) as any,
        )
    }

    protected async handleEmojiCodeCommand(ctx: TelegrafContext) {
        try {
            if (!this.isCustomEmojiDebugEnabled()) {
                await this.replyStyled(ctx, 'MENU_BUTTON_INFO', 'Emoji debug выключен.')
                return
            }

            const message: any = ctx.message
            const text = String(message?.text || '')
            const commandPayload = text.replace(/^\/code(@\w+)?\s*/i, '').trim()

            if (!commandPayload) {
                await ctx.reply(['Использование:', '/code <эмодзи или текст с эмодзи>'].join('\n'))
                return
            }

            const uniqueCustomEmojiItems = extractCustomEmojiItemsFromMessage(message)

            this.logger.log(
                JSON.stringify({
                    event: 'telegram code emoji debug',
                    telegramUserId: ctx.from?.id ? String(ctx.from.id) : '-',
                    customEmojiCount: uniqueCustomEmojiItems.length,
                    customEmojiIds: uniqueCustomEmojiItems.map((item) => item.id),
                }),
                'BotUpdate',
            )

            if (uniqueCustomEmojiItems.length === 1) {
                await ctx.reply(`custom_emoji_id: ${uniqueCustomEmojiItems[0].id}`)
                return
            }

            if (uniqueCustomEmojiItems.length > 1) {
                await ctx.reply(
                    uniqueCustomEmojiItems.map((item, index) => `${index + 1}. ${item.emoji} — ${item.id}`).join('\n'),
                )
                return
            }

            await ctx.reply(['custom_emoji_id не найден', 'Telegram прислал это как обычный текст/эмодзи.'].join('\n'))
        } catch (error: any) {
            this.logger.error(
                `Bot /code failed for ${ctx.from?.id || '-'}: ${error?.message || 'unknown'}`,
                'BotUpdate',
            )
            await this.replyStyled(ctx, 'MENU_BUTTON_INFO', 'Не удалось обработать сообщение. Попробуйте ещё раз.')
        }
    }
    protected async handleEmojiCheckCommand(ctx: TelegrafContext) {
        if (!this.isCustomEmojiDebugEnabled()) {
            await this.replyStyled(ctx, 'MENU_BUTTON_INFO', 'Emoji debug is disabled.')
            return
        }

        const refs = getCustomEmojiRefs()
        const getCustomEmojiStickers = (ctx.telegram as any)?.getCustomEmojiStickers
        if (typeof getCustomEmojiStickers !== 'function') {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_INFO',
                'Emoji check is unavailable: getCustomEmojiStickers is not supported.',
            )
            return
        }

        const results = []
        for (const ref of refs) {
            try {
                const stickers = await getCustomEmojiStickers.call(ctx.telegram, [ref.id])
                const valid =
                    Array.isArray(stickers) &&
                    stickers.some((sticker: any) => String(sticker?.custom_emoji_id) === ref.id)
                results.push({ ...ref, valid, error: valid ? undefined : 'not found by Telegram API' })
            } catch (error: any) {
                results.push({ ...ref, valid: false, error: error?.message || 'unknown' })
            }
        }

        this.logger.log(
            JSON.stringify({
                event: 'telegram custom emoji check',
                total: results.length,
                invalid: results
                    .filter((result) => !result.valid)
                    .map((result) => ({ key: result.key, id: result.id, error: result.error })),
            }),
            'BotUpdate',
        )

        await ctx.reply(buildEmojiCheckReport(results))
    }
}
