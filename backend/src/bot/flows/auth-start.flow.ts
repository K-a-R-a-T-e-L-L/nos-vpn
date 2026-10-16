import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { BOT_CALLBACK } from '../bot.constants'
import { tgEmoji } from '../custom-emoji.registry'
import { BotPurchaseFlow } from './purchase.flow'

export abstract class BotAuthStartFlow extends BotPurchaseFlow {
    protected async tryHandleSupportFromStart(ctx: TelegrafContext) {
        const payload = this.getStartPayload(ctx)
        if (payload !== 'support') {
            return false
        }

        await this.openNavigationSection(ctx, 'support', () => this.enterSupportMode(ctx))
        return true
    }

    protected async tryHandleTelegramLinkFromStart(ctx: TelegrafContext) {
        const payload = this.getStartPayload(ctx)
        if (!payload.startsWith('link_')) {
            return false
        }

        const from = ctx.from
        if (!from) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Не удалось получить данные Telegram. Напишите в поддержку.',
            )
            return true
        }

        try {
            await this.userService.linkTelegramByStartPayload(payload, {
                id: from.id,
                username: from.username,
                first_name: from.first_name,
                last_name: from.last_name,
                is_premium: (from as any).is_premium,
                language_code: from.language_code,
            })

            await ctx.reply(
                [
                    `${tgEmoji('MENU_BUTTON_GET_ACCESS')} <b>Telegram привязан</b>`,
                    'Теперь сайт и бот работают как один аккаунт NOS VPN.',
                    'Нажмите кнопку ниже, чтобы открыть лучшие тарифы, стабильные серверы и все возможности вашего кабинета.',
                ].join('\n\n'),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_GET_ACCESS', 'Продолжить'),
                                BOT_CALLBACK.TELEGRAM_LINK_CONTINUE,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
        } catch (error: any) {
            this.logger.warn(`Telegram link failed for ${from.id}: ${error?.message || 'unknown'}`, 'BotUpdate')
            await ctx.reply(
                [
                    `${tgEmoji('MENU_BUTTON_SUPPORT')} <b>Не удалось привязать Telegram</b>`,
                    'Ссылка могла устареть, либо этот Telegram уже подключен к другому аккаунту.',
                    'Если нужно быстро разобраться и восстановить единый аккаунт, напишите в поддержку.',
                ].join('\n\n'),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'),
                                BOT_CALLBACK.SUPPORT,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
        }

        return true
    }

    protected async tryHandleTelegramAuthFromStart(ctx: TelegrafContext) {
        const payload = this.getStartPayload(ctx)
        if (!payload.startsWith('auth_')) {
            return false
        }

        const from = ctx.from
        if (!from) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Не удалось получить данные Telegram. Напишите в поддержку.',
            )
            return true
        }

        try {
            const provisioned = await this.userService.confirmTelegramAuthByStartPayload(payload, {
                id: from.id,
                username: from.username,
                first_name: from.first_name,
                last_name: from.last_name,
                is_premium: (from as any).is_premium,
                language_code: from.language_code,
            })

            const lines = [
                `${tgEmoji('MENU_BUTTON_GET_ACCESS')} <b>Вход подтверждён</b>`,
                'Вернитесь на сайт NOS VPN — кабинет откроется автоматически.',
                'Нажмите кнопку ниже, чтобы перейти к выгодным тарифам, стабильным серверам и быстрому подключению.',
            ]

            if (provisioned.temporaryCredentials) {
                lines.push(
                    this.buildTemporaryWebCredentialsMessage(
                        provisioned.temporaryCredentials.login,
                        provisioned.temporaryCredentials.password,
                    ),
                )
            }

            await ctx.reply(
                lines.join('\n\n'),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_GET_ACCESS', 'Продолжить'),
                                BOT_CALLBACK.TELEGRAM_LINK_CONTINUE,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
        } catch (error: any) {
            this.logger.warn(`Telegram web auth failed for ${from.id}: ${error?.message || 'unknown'}`, 'BotUpdate')
            await ctx.reply(
                [
                    `${tgEmoji('MENU_BUTTON_SUPPORT')} <b>Не удалось войти через Telegram</b>`,
                    'Ссылка могла устареть. Вернитесь на сайт и попробуйте войти через Telegram ещё раз.',
                ].join('\n\n'),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'),
                                BOT_CALLBACK.SUPPORT,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
        }

        return true
    }
    protected async showStartAccountChoice(ctx: TelegrafContext) {
        await ctx.reply(
            [
                `${tgEmoji('MENU_BUTTON_INFO')} <b>Как вам удобнее начать?</b>`,
                'Если аккаунта ещё нет, бот сразу создаст его и выдаст данные для быстрого входа на сайт.',
                'Если аккаунт уже создан на сайте, бот подготовит код привязки Telegram без лишних шагов и дублей.',
            ].join('\n\n'),
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_TARIFFS', 'Я новый пользователь'),
                            BOT_CALLBACK.START_NEW_USER,
                        ),
                    ],
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_GET_ACCESS', 'У меня уже есть акк на сайте'),
                            BOT_CALLBACK.START_LINK_SITE_ACCOUNT,
                        ),
                    ],
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'),
                            BOT_CALLBACK.SUPPORT,
                        ),
                    ],
                ]) as any,
            ) as any,
        )
    }

    protected async provisionCurrentTelegramUser(ctx: TelegrafContext) {
        const from = ctx.from
        if (!from) {
            throw new Error('Telegram user context is missing')
        }

        return this.userService.ensureTelegramUserWithMetadata({
            id: from.id,
            username: from.username,
            first_name: from.first_name,
            last_name: from.last_name,
            is_premium: (from as any).is_premium,
            language_code: from.language_code,
        })
    }

    protected buildTemporaryWebCredentialsMessage(login: string, password: string) {
        const escapedLogin = this.escapeHtml(login)
        const escapedPassword = this.escapeHtml(password)

        return [
            '<b>Данные для входа на сайт</b>',
            `<pre><code>Логин: ${escapedLogin}\nПароль: ${escapedPassword}</code></pre>`,
            'Сохраните их сейчас, а после входа замените на свои email и пароль.',
        ].join('\n')
    }

    protected async replyWithTemporaryWebCredentials(
        ctx: TelegrafContext,
        credentials?: { login: string; password: string },
    ) {
        if (!credentials) {
            return
        }

        await ctx.reply(
            this.buildTemporaryWebCredentialsMessage(credentials.login, credentials.password),
            this.htmlReplyOptions() as any,
        )
    }

    protected async tryAttachReferrerFromStartPayload(ctx: TelegrafContext) {
        const payload = this.getStartPayload(ctx)
        if (!payload.startsWith('ref_')) {
            return
        }

        try {
            const user = await this.ensureBotUser(ctx)
            await this.referralService.attachReferrer(user.id, payload)
        } catch {
            return
        }
    }
    protected async handleStart(ctx: TelegrafContext) {
        await this.withReplyTracing(ctx, '/start', async () => {
            this.logger.log(`Bot /start received from ${ctx.from?.id || '-'}`, 'BotUpdate')
            if (await this.tryHandleTelegramAuthFromStart(ctx)) {
                return
            }
            if (await this.tryHandleTelegramLinkFromStart(ctx)) {
                return
            }
            const existingUser = ctx.from ? await this.userService.getUserByTelegramId(ctx.from.id) : null
            if (!existingUser && !this.getStartPayload(ctx)) {
                await this.showStartAccountChoice(ctx)
                return
            }
            this.logger.log('Bot /start BEFORE ensureBotUser', 'BotUpdate')
            const provisionedUser = existingUser ? null : await this.provisionCurrentTelegramUser(ctx)
            const user = existingUser || provisionedUser!.user
            this.logger.log('Bot /start AFTER ensureBotUser', 'BotUpdate')
            await this.analyticsService.trackBotStart(user.id, this.getStartPayload(ctx))
            if (await this.tryHandlePaymentReturnFromStart(ctx, user)) {
                return
            }
            if (await this.tryHandleSupportFromStart(ctx)) {
                return
            }
            this.logger.log('Bot /start BEFORE tryAttachReferrerFromStartPayload', 'BotUpdate')
            await this.tryAttachReferrerFromStartPayload(ctx)
            this.logger.log('Bot /start AFTER tryAttachReferrerFromStartPayload', 'BotUpdate')
            await this.prepareStartNavigation(ctx)
            this.logger.log('Bot /start BEFORE startCommand.handle', 'BotUpdate')
            const welcomeMessage = await this.startCommand.handle(ctx, user)
            this.saveWelcomeMessage(ctx, (welcomeMessage as any)?.message_id)
            this.logger.log('Bot /start AFTER startCommand.handle', 'BotUpdate')
            await this.replyWithTemporaryWebCredentials(ctx, provisionedUser?.temporaryCredentials)
            this.logger.log('Bot /start BEFORE showMainMenu', 'BotUpdate')
            await this.showMainMenu(ctx)
            this.logger.log('Bot /start AFTER showMainMenu', 'BotUpdate')
        })
    }

    protected async handleStartLinkSiteAccount(ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        const from = ctx.from
        if (!from) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_SUPPORT',
                'Не удалось получить данные Telegram. Напишите в поддержку.',
            )
            return
        }

        try {
            const result = await this.userService.createTelegramSiteLinkCode({
                id: from.id,
                username: from.username,
                first_name: from.first_name,
                last_name: from.last_name,
                is_premium: (from as any).is_premium,
                language_code: from.language_code,
            })

            await ctx.reply(
                [
                    `${tgEmoji('MENU_BUTTON_GET_ACCESS')} <b>Код для привязки готов</b>`,
                    `Введите на сайте код <code>${result.code}</code> и подключите Telegram к своему аккаунту за пару секунд.`,
                    'Код действует 15 минут. После подтверждения все управление подпиской, доступом и продлением будет в одном месте.',
                ].join('\n\n'),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'),
                                BOT_CALLBACK.SUPPORT,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
        } catch (error: any) {
            this.logger.warn(
                `Telegram site-link code failed for ${from.id}: ${error?.message || 'unknown'}`,
                'BotUpdate',
            )
            await ctx.reply(
                [
                    `${tgEmoji('MENU_BUTTON_SUPPORT')} <b>Не удалось подготовить код</b>`,
                    'Похоже, этот Telegram уже подключен к другому аккаунту NOS VPN.',
                    'Если нужно помочь с объединением или восстановлением доступа, напишите в поддержку.',
                ].join('\n\n'),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'),
                                BOT_CALLBACK.SUPPORT,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
        }
    }
}
