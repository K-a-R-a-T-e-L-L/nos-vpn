import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { buildMainMenuButtons, buildMainMenuMessage } from '../bot-inline-menu'
import { BotNavigationSection } from '../bot-navigation.service'
import { BOT_CALLBACK, BOT_OFFICIAL_CHANNEL } from '../bot.constants'
import { BotFlowBase } from './bot-flow.base'

export abstract class BotNavigationFlow extends BotFlowBase {
    protected async showMainMenu(ctx: TelegrafContext, _withKeyboardControl = false) {
        const user = await this.ensureBotUser(ctx)
        if (!(await this.requireOfficialChannelMembership(ctx))) {
            return
        }

        if (ctx.from) {
            this.promoAwaitingUsers.delete(String(ctx.from.id))
            this.adminBroadcastAwaitingUsers.delete(String(ctx.from.id))
            this.adminBroadcastDrafts.delete(String(ctx.from.id))
        }
        await this.safeDeleteIncomingTextMessage(ctx)
        await this.clearNavigationMessages(ctx, false, this.getCallbackMessageId(ctx))

        const subscription = await this.subscriptionService.getResolvedForUser(user.id)
        const activeSubscription =
            subscription?.status === StatusesEnum.ACTIVE || subscription?.status === StatusesEnum.GRACE
        const buttons = buildMainMenuButtons(activeSubscription, !user.hasUsedTrial)

        const sent = await ctx.reply(buildMainMenuMessage(), {
            ...Markup.inlineKeyboard(buttons),
            parse_mode: 'HTML',
        } as any)

        this.saveNavigationState(ctx, 'main_menu', (sent as any)?.message_id)
    }

    protected async openNavigationSection(
        ctx: TelegrafContext,
        section: BotNavigationSection,
        handler: () => Promise<void>,
        preserveCurrentMessage = false,
    ) {
        if (section !== 'support') {
            await this.ensureBotUser(ctx)
            if (!(await this.requireOfficialChannelMembership(ctx))) {
                return
            }
        }

        await this.safeDeleteIncomingTextMessage(ctx)
        const callbackMessageId = this.getCallbackMessageId(ctx)
        await this.clearNavigationMessages(
            ctx,
            false,
            preserveCurrentMessage ? undefined : callbackMessageId,
            preserveCurrentMessage ? callbackMessageId : undefined,
        )

        const originalReply = ctx.reply.bind(ctx)
        const originalReplyWithPhoto = ctx.replyWithPhoto.bind(ctx)
        const sectionMessageIds: number[] = []
        let backButtonInjected = false

        ;(ctx as any).reply = async (...args: any[]) => {
            if (!backButtonInjected) {
                args[1] = this.withInlineBackButton(args[1])
                backButtonInjected = true
            }
            const result = await originalReply(...args)
            const messageId = (result as any)?.message_id
            if (messageId && !sectionMessageIds.includes(messageId)) {
                sectionMessageIds.push(messageId)
            }
            return result
        }
        ;(ctx as any).replyWithPhoto = async (...args: any[]) => {
            if (!backButtonInjected) {
                args[1] = this.withInlineBackButton(args[1])
                backButtonInjected = true
            }
            const result = await originalReplyWithPhoto(...args)
            const messageId = (result as any)?.message_id
            if (messageId && !sectionMessageIds.includes(messageId)) {
                sectionMessageIds.push(messageId)
            }
            return result
        }

        try {
            await handler()
        } finally {
            ;(ctx as any).reply = originalReply
            ;(ctx as any).replyWithPhoto = originalReplyWithPhoto
        }

        if (!sectionMessageIds.length) {
            return
        }

        this.saveNavigationState(ctx, section, sectionMessageIds)
    }

    protected async hasOfficialChannelMembership(ctx: TelegrafContext) {
        if (!ctx.from) {
            return false
        }

        const member: any = await this.bot.telegram.getChatMember(BOT_OFFICIAL_CHANNEL.username, ctx.from.id)
        switch (member?.status) {
            case 'creator':
            case 'administrator':
            case 'member':
                return true
            case 'restricted':
                return member.is_member === true
            case 'left':
            case 'kicked':
            default:
                return false
        }
    }

    protected async requireOfficialChannelMembership(ctx: TelegrafContext) {
        if ((ctx as any).__officialChannelMembershipVerified === true) {
            return true
        }

        try {
            const isMember = await this.hasOfficialChannelMembership(ctx)
            if (isMember) {
                ;(ctx as any).__officialChannelMembershipVerified = true
                return true
            }

            await this.renderOfficialChannelGate(ctx, 'not_subscribed')
            return false
        } catch (error: any) {
            this.logger.warn(
                `Official channel membership check failed for telegramUser=${ctx.from?.id || '-'} channel=${BOT_OFFICIAL_CHANNEL.username}: ${error?.message || 'unknown'}`,
                'BotUpdate',
            )
            await this.renderOfficialChannelGate(ctx, 'check_failed')
            return false
        }
    }

    protected async renderOfficialChannelGate(ctx: TelegrafContext, mode: 'not_subscribed' | 'check_failed') {
        const isCheckFailed = mode === 'check_failed'
        const text = isCheckFailed
            ? [
                  '⚠️ <b>Не удалось проверить подписку</b>',
                  'Попробуйте ещё раз через несколько секунд.',
                  'Если проблема сохраняется, вы всё равно можете открыть канал или написать в поддержку.',
              ].join('\n\n')
            : [
                  '📣 <b>Остался один шаг</b>',
                  'Чтобы пользоваться NOS VPN через Telegram, подпишитесь на наш официальный канал.',
                  'Там публикуем важные новости о работе сервиса, обновления и информацию о возможных неполадках.',
                  'После подписки нажмите <b>«Проверить подписку»</b>.',
              ].join('\n\n')
        const buttons = isCheckFailed
            ? [
                  [Markup.button.callback('🔄 Проверить ещё раз', BOT_CALLBACK.CHANNEL_CHECK)],
                  [Markup.button.url('📣 Открыть канал', BOT_OFFICIAL_CHANNEL.url)],
                  [Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT)],
              ]
            : [
                  [Markup.button.url('📣 Подписаться на канал', BOT_OFFICIAL_CHANNEL.url)],
                  [Markup.button.callback('✅ Проверить подписку', BOT_CALLBACK.CHANNEL_CHECK)],
              ]

        await ctx.reply(text, this.htmlReplyOptions(Markup.inlineKeyboard(buttons) as any) as any)
    }

    protected saveWelcomeMessage(ctx: TelegrafContext, welcomeMessageId?: number) {
        const telegramId = ctx.from?.id
        if (!telegramId || !welcomeMessageId) {
            return
        }

        this.navigationService.patch(telegramId, { welcomeMessageId })
    }

    protected saveNavigationState(ctx: TelegrafContext, section: BotNavigationSection, navigationMessageIds: number[]) {
        const telegramId = ctx.from?.id
        if (!telegramId) {
            return
        }

        this.navigationService.patch(telegramId, {
            navigationMessageId: navigationMessageIds[navigationMessageIds.length - 1],
            navigationMessageIds,
            section,
        })
    }

    protected async prepareStartNavigation(ctx: TelegrafContext) {
        await this.safeDeleteIncomingTextMessage(ctx)
        await this.clearNavigationMessages(ctx, true)
    }

    protected async clearNavigationMessages(
        ctx: TelegrafContext,
        includeWelcome = false,
        extraMessageId?: number,
        skipMessageId?: number,
    ) {
        const telegramId = ctx.from?.id
        const chatId = ctx.chat?.id
        const state = this.navigationService.get(telegramId)
        if (!state || !chatId) {
            await this.safeDeleteMessage(ctx, chatId, extraMessageId)
            this.navigationService.clear(telegramId)
            return
        }

        if (includeWelcome) {
            await this.safeDeleteMessage(ctx, chatId, state.welcomeMessageId)
        }
        const storedMessageIds = state.navigationMessageIds?.length
            ? state.navigationMessageIds
            : state.navigationMessageId
              ? [state.navigationMessageId]
              : []

        for (const messageId of storedMessageIds) {
            if (skipMessageId && messageId === skipMessageId) {
                continue
            }
            await this.safeDeleteMessage(ctx, chatId, messageId)
        }

        if (extraMessageId && extraMessageId !== skipMessageId && !storedMessageIds.includes(extraMessageId)) {
            await this.safeDeleteMessage(ctx, chatId, extraMessageId)
        }

        if (includeWelcome) {
            this.navigationService.clear(telegramId)
            return
        }

        this.navigationService.set(telegramId, { welcomeMessageId: state.welcomeMessageId })
    }

    protected async safeDeleteIncomingTextMessage(ctx: TelegrafContext) {
        const message: any = ctx.message
        const chatId = ctx.chat?.id
        const messageId = message?.message_id
        if (!chatId || !messageId) {
            return
        }

        await this.safeDeleteMessage(ctx, chatId, messageId)
    }

    protected getCallbackMessageId(ctx: TelegrafContext) {
        const callbackQuery: any = ctx.callbackQuery
        return callbackQuery?.message?.message_id
    }

    protected async safeDeleteMessage(ctx: TelegrafContext, chatId?: string | number, messageId?: number) {
        if (!chatId || !messageId) {
            return
        }

        try {
            await ctx.telegram.deleteMessage(chatId, messageId)
        } catch (error: any) {
            this.logger.warn(`Navigation message delete skipped: ${error?.message || 'unknown'}`, 'BotUpdate')
        }
    }

    protected withInlineBackButton(extra: any = {}) {
        const source = extra && typeof extra === 'object' ? extra : {}
        const replyMarkup = source.reply_markup || {}
        const inlineKeyboard = Array.isArray(replyMarkup.inline_keyboard) ? replyMarkup.inline_keyboard : []
        const hasBackButton = inlineKeyboard.some((row: any[]) =>
            row.some((button: any) => button?.callback_data === BOT_CALLBACK.BACK),
        )

        return {
            ...source,
            reply_markup: {
                ...replyMarkup,
                inline_keyboard: hasBackButton
                    ? inlineKeyboard
                    : [...inlineKeyboard, [Markup.button.callback('⬅️ Назад', BOT_CALLBACK.BACK)]],
            },
        }
    }

    protected async renderNavigationTextMessage(
        ctx: TelegrafContext,
        section: BotNavigationSection,
        text: string,
        buttons: any[][],
    ) {
        const messageId = this.getCallbackMessageId(ctx)
        const chatId = ctx.chat?.id
        const keyboard = buttons.some((row) => row.some((button: any) => button?.callback_data === BOT_CALLBACK.BACK))
            ? buttons
            : [...buttons, [Markup.button.callback('⬅️ Назад', BOT_CALLBACK.BACK)]]
        const replyOptions = this.htmlReplyOptions(Markup.inlineKeyboard(keyboard) as any) as any

        if (messageId && chatId) {
            try {
                await ctx.telegram.editMessageText(chatId, messageId, undefined, text, replyOptions)
                this.saveNavigationState(ctx, section, [messageId])
                return
            } catch (error: any) {
                if (
                    String(error?.message || '')
                        .toLowerCase()
                        .includes('message is not modified')
                ) {
                    this.saveNavigationState(ctx, section, [messageId])
                    return
                }
                this.logger.warn(`Navigation message edit skipped: ${error?.message || 'unknown'}`, 'BotUpdate')
            }
        }

        const sent = await ctx.reply(text, replyOptions)
        const sentMessageId = (sent as any)?.message_id
        if (sentMessageId) {
            this.saveNavigationState(ctx, section, [sentMessageId])
        }
    }
}
