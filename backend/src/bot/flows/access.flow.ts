import * as QRCode from 'qrcode'
import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { BOT_CALLBACK } from '../bot.constants'
import { CustomEmojiKey, tgEmoji } from '../custom-emoji.registry'
import { BotAdminBroadcastFlow } from './admin-broadcast.flow'

export abstract class BotAccessFlow extends BotAdminBroadcastFlow {
    protected async handleGetAccess(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        if (!user?.subscription) {
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_GET_ACCESS',
                    'У вас пока нет подписки. Выберите тариф или начните с бесплатного старта.',
                ),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_TARIFFS', 'Выбрать тариф'),
                                BOT_CALLBACK.TARIFFS,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
            return
        }

        await this.sendAccessMessage(ctx, user.subscription.id)
    }

    protected async sendAccessMessage(ctx: TelegrafContext, subscriptionId: string, introLines: string[] = []) {
        const subscription = await this.subscriptionService.getResolvedById(subscriptionId)
        const payload = await this.accessPresentationService.buildPayload(subscriptionId, subscription)
        if (ctx.from?.id) {
            const user = await this.userService.getUserByTelegramId(ctx.from.id)
            if (user) {
                await this.analyticsService.trackAccessViewed(user.id, {
                    channel: 'telegram',
                    subscriptionId,
                })
            }
        }
        this.logger.log(
            [
                'sendAccessMessage payload:',
                `subscriptionId=${subscriptionId}`,
                `resolvedStatus=${subscription?.status || '-'}`,
                `hasPayload=${Boolean(payload)}`,
                `deliveryMode=${payload?.deliveryMode || '-'}`,
                `status=${payload?.status || '-'}`,
                `subscriptionUrl=${payload?.subscriptionUrl ? 'present' : 'empty'}`,
                `qrPayload=${payload?.qrPayload ? 'present' : 'empty'}`,
                `rawConfig=${payload?.rawConfig ? 'present' : 'empty'}`,
            ].join(' '),
            'BotUpdate',
        )
        if (!payload) {
            if (
                subscription?.status === StatusesEnum.GRACE &&
                subscription.graceEndsAt &&
                subscription.graceEndsAt > new Date()
            ) {
                await this.replyStyled(
                    ctx,
                    'SUBSCRIPTION_STATUS',
                    'Доступ ещё активен, но ссылка временно обновляется. Попробуйте позже или напишите в поддержку.',
                )
                return
            }

            if (subscription?.status === StatusesEnum.EXPIRED) {
                await this.replyStyled(
                    ctx,
                    'SUBSCRIPTION_STATUS',
                    'Подписка уже истекла. Продлите доступ, и ссылка снова появится в кабинете.',
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_RENEW', 'Продлить доступ'),
                                BOT_CALLBACK.RENEW,
                            ),
                        ],
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'),
                                BOT_CALLBACK.SUPPORT,
                            ),
                        ],
                    ]) as any,
                )
                return
            }

            await this.replyStyled(
                ctx,
                'SUBSCRIPTION_STATUS',
                'Доступ ещё готовится. Попробуйте позже или напишите в поддержку.',
            )
            return
        }

        if (payload.deliveryMode === 'DIRECT_URL') {
            try {
                await ctx.reply(
                    this.buildAccessReadyHtml(payload),
                    this.htmlReplyOptions(Markup.inlineKeyboard(this.buildAccessReadyButtons()) as any) as any,
                )
            } catch (error: any) {
                this.logger.error(
                    `Formatted access message failed: ${error?.message || 'unknown'}; stack=${error?.stack || 'n/a'}`,
                    'BotUpdate',
                )
                await ctx.reply(
                    this.buildSafeAccessReadyMessage(payload),
                    this.htmlReplyOptions(Markup.inlineKeyboard(this.buildAccessReadyButtons()) as any) as any,
                )
            }
            return
        }

        if (payload.deliveryMode === 'RAW_CONFIG_ONLY') {
            await ctx.reply(
                [
                    ...introLines,
                    `${tgEmoji('SUBSCRIPTION_STATUS')} <b>Доступ частично готов</b>`,
                    'Прямая ссылка пока недоступна.',
                    'Нажмите «Поддержка», и мы поможем подобрать подходящий клиент и подключиться вручную.',
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
            return
        }

        if (this.isGraceAccessUnavailable(payload)) {
            await ctx.reply(
                [
                    ...introLines,
                    `${tgEmoji('SUBSCRIPTION_STATUS')} <b>Доступ ещё активен, но ссылка временно обновляется.</b>`,
                    'Попробуйте позже или напишите в поддержку.',
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
            return
        }

        await ctx.reply(
            [
                ...introLines,
                `${tgEmoji('SUBSCRIPTION_STATUS')} <b>Доступ готовится.</b>`,
                'Обычно это занимает пару минут после активации.',
                'Если ожидание затянулось — напишите в поддержку.',
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

    protected isGraceAccessUnavailable(payload: any) {
        if (
            payload?.status !== StatusesEnum.GRACE ||
            payload?.deliveryMode !== 'UNAVAILABLE' ||
            !payload?.graceEndsAt
        ) {
            return false
        }

        return new Date(payload.graceEndsAt) > new Date()
    }

    protected buildAccessReadyHtml(payload: any) {
        const planLine = this.buildAccessPlanLine(payload)
        const expiresAt = this.escapeHtml(this.formatDate(payload.expiresAt))
        const subscriptionUrl = this.escapeHtml(payload.subscriptionUrl || '')

        return [
            `${tgEmoji('ACCESS_TITLE')} Доступ готов`,
            planLine,
            `${tgEmoji('ACCESS_CLOCK')} <i>Действует до:</i> ${expiresAt}`,
            `<i>Ссылка доступа:</i>\n${tgEmoji('ACCESS_LINK_BULLET')} ${subscriptionUrl}`,
            '<blockquote>Откройте ссылку: на странице подписки будут инструкция и список совместимых клиентов. Для быстрого старта рекомендуем Happ. Если не получится подключиться, напишите в поддержку.</blockquote>',
            `<blockquote>${tgEmoji('REFERRAL_TITLE')} Приглашайте друзей и получайте 50% с каждой их оплаты в кошелёк. Пара активных друзей может закрыть стоимость вашей подписки.</blockquote>`,
        ].join('\n\n')
    }

    protected buildAccessPlanLine(payload: any) {
        const planTitle = this.escapeHtml(payload?.planTitle || payload?.plan || '-')
        const planNumber = this.extractPlanNumber(payload?.planCode || payload?.plan)
        const planEmoji = tgEmoji(planNumber ? this.getTariffListEmojiKey(`vpn_${planNumber}`) : 'SUBSCRIPTION_TARIFF')
        const planDescription = payload?.planDescription
            ? `\n${tgEmoji('TARIFF_DEVICE_COUNT')} ${this.escapeHtml(payload.planDescription)}`
            : ''

        return `${planEmoji} <b>${planTitle}</b>${planDescription}`
    }

    protected buildSafeAccessReadyMessage(payload: any) {
        const planTitle = payload.planTitle || payload.plan || '-'
        const planDescription = payload.planDescription ? `\n${payload.planDescription}` : ''

        return [
            'Доступ готов',
            `Тариф: ${planTitle}${planDescription}`,
            `Действует до: ${this.formatDate(payload.expiresAt)}`,
            payload.subscriptionUrl ? `Ссылка доступа:\n${payload.subscriptionUrl}` : 'Ссылка пока недоступна.',
            'Откройте ссылку: на странице подписки будут инструкция и список совместимых клиентов. Для быстрого старта рекомендуем Happ. Если не получится подключиться, напишите в поддержку.',
        ].join('\n\n')
    }

    protected buildAccessReadyButtons() {
        return [
            [
                Markup.button.callback(
                    this.buttonLabel('ACCESS_LINK_BULLET', 'Открыть QR-код'),
                    BOT_CALLBACK.GET_ACCESS_QR,
                ),
            ],
            [Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT)],
        ]
    }

    protected async handleGetAccessQr(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        if (!user?.subscription?.id) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_GET_ACCESS',
                'У вас пока нет активного доступа. Выберите тариф или напишите в поддержку.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_TARIFFS', 'Выбрать тариф'),
                            BOT_CALLBACK.TARIFFS,
                        ),
                    ],
                ]) as any,
            )
            return
        }

        const subscription = await this.subscriptionService.getResolvedById(user.subscription.id)
        const payload = await this.accessPresentationService.buildPayload(user.subscription.id, subscription)
        await this.analyticsService.trackQrOpened(user.id)
        const isSent = await this.sendAccessQrPhoto(ctx, payload)
        if (!isSent) {
            await this.replyStyled(
                ctx,
                'ACCESS_LINK_BULLET',
                'QR-код временно недоступен. Откройте ссылку доступа из сообщения выше или напишите в поддержку.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'),
                            BOT_CALLBACK.SUPPORT,
                        ),
                    ],
                ]) as any,
            )
        }
    }

    protected async sendAccessQrPhoto(ctx: TelegrafContext, payload: any) {
        const qrPayload = payload?.qrPayload || payload?.subscriptionUrl
        if (!qrPayload) {
            return false
        }

        try {
            const qrPng = await QRCode.toBuffer(qrPayload, {
                type: 'png',
                margin: 2,
                width: 720,
                errorCorrectionLevel: 'M',
            })

            await ctx.replyWithPhoto({ source: qrPng }, {
                caption: [
                    `${tgEmoji('ACCESS_LINK_BULLET')} QR-код доступа`,
                    'Отсканируйте его в приложении для подключения VPN.',
                ].join('\n'),
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', BOT_CALLBACK.BACK)]])
                    .reply_markup,
            } as any)
            return true
        } catch (error: any) {
            this.logger.error(
                `Access QR photo failed: ${error?.message || 'unknown'}; stack=${error?.stack || 'n/a'}`,
                'BotUpdate',
            )
            return false
        }
    }

    protected extractPlanNumber(plan?: string | null) {
        const normalized = String(plan || '').toLowerCase()
        const match = normalized.match(/(?:vpn[_-]?|^|\D)([123])(?:\D|$)/)
        return match?.[1] || null
    }

    protected getPlanNumberEmojiKey(planNumber: string): CustomEmojiKey {
        const map: Record<string, CustomEmojiKey> = {
            '1': 'ACCESS_PLAN_1',
            '2': 'ACCESS_PLAN_2',
            '3': 'ACCESS_PLAN_3',
        }

        return map[planNumber]
    }
}
