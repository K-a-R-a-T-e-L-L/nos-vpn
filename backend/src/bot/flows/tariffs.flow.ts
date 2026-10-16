import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import {
    buildPeriodLabel,
    buildSavingsPercent,
    isLegacyNamedPlan,
    resolveLegacyDevicesLimit,
} from '../../plan/plan.defaults'
import { ActionsEnum } from '../../subscription/enum/actions.enum'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { BOT_CALLBACK } from '../bot.constants'
import { tgEmoji } from '../custom-emoji.registry'
import { BotReferralFlow } from './referral.flow'

export abstract class BotTariffsFlow extends BotReferralFlow {
    protected async showTariffs(ctx: TelegrafContext, withHeader = false) {
        const user = await this.ensureBotUser(ctx)
        const parts: string[] = []
        if (withHeader) {
            parts.push(`${tgEmoji('MENU_BUTTON_TARIFFS')} <b>Тарифы VPN</b>`)
        }

        const catalog = await this.planService.getPublicCatalog()
        if (!catalog.durations.length || !catalog.rows.length) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_TARIFFS',
                'Тарифы временно недоступны. Попробуйте позже или напишите в поддержку.',
            )
            return
        }

        parts.push(
            `${tgEmoji('MENU_BUTTON_RENEW')} <b>Выберите период</b>`,
            'Сначала выберите срок подписки, затем количество устройств.',
        )

        if (!user.hasUsedTrial) {
            parts.push(`${tgEmoji('SUBSCRIPTION_TRIAL')} Бесплатный старт на 3 дня для 1 устройства доступен один раз.`)
        }

        parts.push(`${tgEmoji('REFERRAL_TITLE')} Приглашайте друзей и получайте 50% с каждой их оплаты в кошелёк.`)

        const periodButtons = catalog.durations.map((duration) =>
            Markup.button.callback(
                this.buttonLabel(
                    'SUBSCRIPTION_EXPIRES_AT',
                    this.buildCompactPeriodButtonLabel(duration.label, duration.savingsPercent),
                ),
                `${BOT_CALLBACK.TARIFF_PERIOD_PREFIX}${duration.periodDays}`,
            ),
        )
        const buttons = this.chunkButtons(periodButtons, 2)

        if (!user.hasUsedTrial) {
            buttons.unshift([
                Markup.button.callback(
                    this.buttonLabel('SUBSCRIPTION_TRIAL', 'Попробовать бесплатно 3 дня'),
                    BOT_CALLBACK.START_TRIAL,
                ),
            ])
        }

        buttons.push([
            Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT),
        ])

        await this.renderNavigationTextMessage(ctx, 'tariffs', parts.join('\n\n'), buttons)
    }

    protected async showTariffDevices(ctx: TelegrafContext, period: number, selectedDevicesLimit?: number) {
        const plans = await this.planService.findActiveByPeriod(period)
        if (!plans.length) {
            await this.replyStyled(
                ctx,
                'SUBSCRIPTION_TARIFF',
                'Для выбранного периода пока нет доступных тарифов. Выберите другой срок.',
            )
            return
        }

        const periodLabel = buildPeriodLabel(period)
        const lines = [
            `${tgEmoji('MENU_BUTTON_TARIFFS')} <b>Выберите количество устройств</b>`,
            `${tgEmoji('SUBSCRIPTION_EXPIRES_AT')} Период: ${this.escapeHtml(periodLabel)}`,
        ]

        if (selectedDevicesLimit) {
            lines.push(
                `${tgEmoji('TARIFF_DEVICE_COUNT')} Выбрано: ${selectedDevicesLimit} ${this.pluralizePlanDevices(selectedDevicesLimit)}`,
            )
            const selectedPlan = plans.find((plan) => Number(plan.devicesLimit || 0) === selectedDevicesLimit)
            if (selectedPlan) {
                lines.push(
                    `${tgEmoji('MENU_BUTTON_RENEW')} Стоимость: ${this.escapeHtml(this.formatRub(selectedPlan.amount))}`,
                )
            }
        }

        const deviceButtons = plans.map((plan) => {
            const devicesLimit = Number(plan.devicesLimit || 1)
            const label = `${selectedDevicesLimit === devicesLimit ? '✓ ' : ''}${devicesLimit} ${this.pluralizePlanDevices(devicesLimit)}`
            return Markup.button.callback(
                this.buttonLabel('TARIFF_DEVICE_COUNT', label),
                `${BOT_CALLBACK.TARIFF_DEVICE_PREFIX}${period}:${devicesLimit}`,
            )
        })
        const buttons = this.chunkButtons(deviceButtons, 2)

        if (selectedDevicesLimit) {
            const selectedPlan = plans.find((plan) => Number(plan.devicesLimit || 0) === selectedDevicesLimit)
            if (selectedPlan) {
                const monthlyPlan = plans.find(
                    (plan) => Number(plan.devicesLimit || 0) === selectedDevicesLimit && Number(plan.period) === 30,
                )
                const savingsPercent = buildSavingsPercent(
                    selectedPlan.amount,
                    selectedPlan.period,
                    monthlyPlan?.amount || null,
                )
                if (savingsPercent) {
                    lines.push(`${tgEmoji('REFERRAL_ARROW')} Выгода относительно помесячной оплаты: ${savingsPercent}%`)
                }

                buttons.push([
                    Markup.button.callback(
                        this.buttonLabel('MENU_BUTTON_RENEW', 'Далее'),
                        `${BOT_CALLBACK.TARIFF_CONTINUE_PREFIX}${period}:${selectedDevicesLimit}`,
                    ),
                ])
            }
        }

        buttons.push([
            Markup.button.callback(this.buttonLabel('SUBSCRIPTION_EXPIRES_AT', 'К периодам'), BOT_CALLBACK.TARIFFS),
        ])

        await this.renderNavigationTextMessage(ctx, 'tariffs', lines.join('\n\n'), buttons)
    }

    protected async tryStartTrialFlow(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        if (user.hasUsedTrial) {
            await ctx.reply(
                this.styledText(
                    'SUBSCRIPTION_TRIAL',
                    'Бесплатный старт уже был использован. Выберите платный тариф или напишите в поддержку, если считаете это ошибкой.',
                ),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_TARIFFS', 'Показать тарифы'),
                                BOT_CALLBACK.TARIFFS,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
            return
        }

        const currentSubscription = await this.subscriptionService.getResolvedForUser(user.id)
        if (currentSubscription?.status === StatusesEnum.ACTIVE || currentSubscription?.status === StatusesEnum.GRACE) {
            await ctx.reply(
                this.styledText(
                    'SUBSCRIPTION_STATUS',
                    'У вас уже есть активный доступ. Откройте ссылку подписки или проверьте статус.',
                ),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_GET_ACCESS', 'Получить доступ'),
                                BOT_CALLBACK.GET_ACCESS,
                            ),
                        ],
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_MY_SUBSCRIPTION', 'Моя подписка'),
                                BOT_CALLBACK.MY_SUBSCRIPTION,
                            ),
                        ],
                    ]) as any,
                ) as any,
            )
            return
        }

        const trialPlan = await this.planService.findActiveByPeriodAndDevices(30, 1)
        if (!trialPlan) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_TARIFFS',
                'Тариф временно недоступен, попробуйте позже или напишите в поддержку.',
            )
            return
        }

        let subscription = await this.subscriptionService.getOne({
            where: { userId: user.id },
            relations: { plan: true },
        })
        if (!subscription) {
            subscription = await this.subscriptionService.create(user, trialPlan.id)
        }

        try {
            await this.subscriptionService.performAction(user, ActionsEnum.TRIAL_START)
            const freshUser = await this.ensureBotUser(ctx)
            const subscriptionId = freshUser.subscription?.id || subscription.id
            await this.sendAccessMessage(ctx, subscriptionId, ['✅ Бесплатный доступ активирован на 3 дня.'])
        } catch (e: any) {
            const errorText = this.getErrorText(e)
            if (errorText.includes('FORBIDDEN') || errorText.toLowerCase().includes('trial')) {
                await ctx.reply(
                    this.styledText(
                        'SUBSCRIPTION_TRIAL',
                        'Бесплатный старт уже был использован. Выберите платный тариф или напишите в поддержку, если считаете это ошибкой.',
                    ),
                    this.htmlReplyOptions(
                        Markup.inlineKeyboard([
                            [
                                Markup.button.callback(
                                    this.buttonLabel('MENU_BUTTON_TARIFFS', 'Показать тарифы'),
                                    BOT_CALLBACK.TARIFFS,
                                ),
                            ],
                        ]) as any,
                    ) as any,
                )
                return
            }

            await this.replyStyled(
                ctx,
                'SUBSCRIPTION_TRIAL',
                'Не удалось активировать бесплатный старт. Попробуйте позже или напишите в поддержку.',
            )
        }
    }

    protected async showRenew(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        const sub = await this.subscriptionService.getOne({ where: { userId: user.id }, relations: { plan: true } })
        if (!sub) {
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_RENEW',
                    'У вас пока нет подписки для продления. Выберите тариф и подключитесь.',
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

        await ctx.reply(
            [
                `${tgEmoji('MENU_BUTTON_RENEW')} <b>Продление доступа</b>`,
                `${tgEmoji('SUBSCRIPTION_TARIFF')} Текущий тариф: ${this.escapeHtml(this.getPlanDisplayTitle(sub.plan))}`,
                `${tgEmoji('TARIFF_DEVICE_COUNT')} ${this.escapeHtml(this.getPlanDeviceLabel(sub.plan))}`,
                `${tgEmoji('SUBSCRIPTION_EXPIRES_AT')} Выберите новый срок и количество устройств для продления или смены тарифа.`,
            ].join('\n\n'),
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_TARIFFS', 'Выбрать тариф'),
                            BOT_CALLBACK.TARIFFS,
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

    protected getPlanDisplayTitle(plan: any) {
        const devicesLimit = resolveLegacyDevicesLimit(plan) || Number(plan?.devicesLimit || 1)
        const title = String(plan?.title || '').trim()
        if (title && !isLegacyNamedPlan(plan)) {
            return title
        }

        const name = String(plan?.name || '').trim()
        if (name && !this.looksLikeDeviceLabel(name) && !isLegacyNamedPlan(plan)) {
            return name
        }

        const period = Number(plan?.period || 30)
        return `${devicesLimit} ${this.pluralizePlanDevices(devicesLimit)} · ${buildPeriodLabel(period)}`
    }

    protected getPlanDeviceLabel(plan: any) {
        const description = String(plan?.description || '').trim()
        if (description) {
            return description
        }

        const name = String(plan?.name || '').trim()
        if (this.looksLikeDeviceLabel(name)) {
            return name
        }
        const devicesLimit = resolveLegacyDevicesLimit(plan) || Number(plan?.devicesLimit || 1)
        return `${devicesLimit} ${this.pluralizePlanDevices(devicesLimit)}`
    }

    protected looksLikeDeviceLabel(value?: string | null) {
        return /\d+\s*устрой/i.test(String(value || '').trim())
    }

    protected tariffButtonLabel(plan: any, text: string) {
        return this.buttonLabel(this.getTariffListEmojiKey(plan?.code), text)
    }

    protected pluralizePlanDevices(count: number) {
        const mod10 = count % 10
        const mod100 = count % 100

        if (mod10 === 1 && mod100 !== 11) {
            return 'устройство'
        }
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
            return 'устройства'
        }
        return 'устройств'
    }

    protected formatRub(amount: number) {
        return `${Number(amount || 0).toLocaleString('ru-RU')} ₽`
    }

    protected buildCompactPeriodButtonLabel(label: string, savingsPercent?: number | null) {
        const compactLabel = String(label || '')
            .replace(/\bмесяц\b/gi, 'мес')
            .replace(/\bмесяца\b/gi, 'мес')
            .replace(/\bмесяцев\b/gi, 'мес')
            .replace(/\s+/g, ' ')
            .trim()

        return savingsPercent ? `${compactLabel} −${savingsPercent}%` : compactLabel
    }

    protected chunkButtons(buttons: any[], columns: number) {
        const rows: any[][] = []
        for (let index = 0; index < buttons.length; index += columns) {
            rows.push(buttons.slice(index, index + columns))
        }
        return rows
    }

    protected getPeriodLabel(period: number) {
        const months = Math.round(period / 30)
        if (months === 1) return '1 месяц'
        if (months >= 2 && months <= 4) return `${months} месяца`
        return `${months} месяцев`
    }
}
