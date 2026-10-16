import { randomUUID } from 'crypto'

import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'
import { buildPeriodLabel } from '../../plan/plan.defaults'
import { ActionsEnum } from '../../subscription/enum/actions.enum'
import { buildBotPrePaymentLegalButtonRows } from '../bot-legal'
import { BOT_CALLBACK } from '../bot.constants'
import { tgEmoji } from '../custom-emoji.registry'
import { BotTariffsFlow } from './tariffs.flow'
import { mapBotCheckoutError } from '../errors/bot-checkout-error.mapper'
import { BotCheckoutMethod, BotPendingCheckout, resolveBotCheckoutMethods } from '../payment/bot-checkout-state'

type TelegramButtonStyle = 'success' | 'primary' | 'danger'
type StyledCallbackButton = ReturnType<typeof Markup.button.callback> & { style?: TelegramButtonStyle }

function styledCallbackButton(text: string, callbackData: string, style?: TelegramButtonStyle): StyledCallbackButton {
    return {
        ...Markup.button.callback(text, callbackData),
        ...(style ? { style } : {}),
    } as StyledCallbackButton
}

export abstract class BotPurchaseFlow extends BotTariffsFlow {
    protected async beginExternalCheckout(ctx: TelegrafContext, planCode: string, promoCode?: string) {
        const telegramUserId = String(ctx.from?.id || '')
        return this.checkoutState.runUserOnce(telegramUserId, () => this.beginExternalCheckoutUnsafe(ctx, planCode, promoCode))
    }

    private async beginExternalCheckoutUnsafe(ctx: TelegrafContext, planCode: string, promoCode?: string) {
        const plan = await this.planService.getOne({ where: { code: planCode, isActive: true } as any })
        if (!plan?.code) return this.replyCheckoutUnavailable(ctx)
        const user = await this.ensureBotUser(ctx)
        const options = await this.checkoutOptionsService.getForPlan(plan.id, PaymentMerchant.BOT, user.id)
        const methods = resolveBotCheckoutMethods(options, Boolean(promoCode))
        // Full-discount promo resolution happens before provider availability in the
        // authoritative payment path, so it is allowed to attempt ordinary checkout.
        if (!methods.length && promoCode) return this.createPaymentForPlanCode(ctx, plan.code, promoCode)
        if (!methods.length) return this.replyCheckoutUnavailable(ctx)
        if (methods.length === 1 && methods[0] !== 'RECURRENT') {
            return this.executeCheckoutMethod(ctx, methods[0], plan.code, promoCode)
        }

        const state = this.checkoutState.begin(String(ctx.from?.id || ''), plan.code, promoCode)
        return this.renderCheckoutMethodSelection(ctx, state.token, plan, methods)
    }

    private async renderCheckoutMethodSelection(
        ctx: TelegrafContext,
        token: string,
        plan: any,
        methods: BotCheckoutMethod[],
    ) {
        const state = this.checkoutState.get(token, String(ctx.from?.id || ''))
        const promoCode = state?.promoCode
        if (!state) return this.replyCheckoutExpired(ctx)
        const rows: any[] = []

        if (methods.includes('RECURRENT')) {
            rows.push([
                styledCallbackButton(
                    'Оплатить через СБП',
                    `${BOT_CALLBACK.PAYMENT_METHOD_RECURRENT_REVIEW_PREFIX}${token}`,
                    'success',
                ),
            ])
        }
        if (methods.includes('CRYPTO')) {
            rows.push([
                styledCallbackButton(
                    'Оплатить криптой',
                    `${BOT_CALLBACK.PAYMENT_METHOD_CRYPTO_PREFIX}${token}`,
                    'primary',
                ),
            ])
        }
        if (methods.includes('ONE_TIME')) {
            rows.push([Markup.button.callback('Оплатить (без автосписаний)', `${BOT_CALLBACK.PAYMENT_METHOD_ONE_PREFIX}${token}`)])
        }

        rows.push([Markup.button.callback(this.buttonLabel('MENU_BUTTON_TARIFFS', 'Назад к тарифам'), BOT_CALLBACK.TARIFFS)])
        rows.push([Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT)])

        await ctx.reply(
            [
                '<b>Выберите способ оплаты</b>',
                `${tgEmoji('SUBSCRIPTION_TARIFF')} Тариф: ${this.escapeHtml(this.getPlanDisplayTitle(plan))}`,
                `${tgEmoji('MENU_BUTTON_RENEW')} Цена: ${this.escapeHtml(this.formatRub(plan.amount))}`,
                promoCode ? `${tgEmoji('REFERRAL_ARROW')} Промокод будет применён при оплате.` : null,
                'При оплате через СБП подключается автоматическое продление подписки посредством рекуррентных платежей.',
            ]
                .filter(Boolean)
                .join('\n\n'),
            this.htmlReplyOptions(Markup.inlineKeyboard(rows) as any) as any,
        )
    }

    protected async handleCheckoutMethod(ctx: TelegrafContext, token: string, method: BotCheckoutMethod) {
        const state = this.checkoutState.get(token, String(ctx.from?.id || ''))
        if (!state) return this.replyCheckoutExpired(ctx)
        await this.checkoutState.runOnce(state, async () => {
            const plan = await this.planService.getOne({ where: { code: state.planCode, isActive: true } as any })
            if (!plan) return this.replyCheckoutUnavailable(ctx)
            const user = await this.ensureBotUser(ctx)
            const options = await this.checkoutOptionsService.getForPlan(plan.id, PaymentMerchant.BOT, user.id)
            if (!resolveBotCheckoutMethods(options, Boolean(state.promoCode)).includes(method)) {
                return this.replyCheckoutUnavailable(ctx)
            }

            if (method === 'RECURRENT') {
                // Promo checkout intentionally keeps the same SBP presentation, but
                // falls back to a one-time payment so the discounted amount cannot
                // become the recurrent subscription amount.
                if (state.promoCode) {
                    if (!options.oneTime.available) return this.replyCheckoutUnavailable(ctx)
                    return this.createPaymentForPlanCode(ctx, state.planCode, state.promoCode)
                }
                return this.createRecurrentPaymentForState(ctx, state)
            }

            await this.executeCheckoutMethod(ctx, method, state.planCode, state.promoCode)
        })
    }

    protected async handleCheckoutBack(ctx: TelegrafContext, token: string) {
        const state = this.checkoutState.get(token, String(ctx.from?.id || ''))
        if (!state) return this.replyCheckoutExpired(ctx)
        const plan = await this.planService.getOne({ where: { code: state.planCode, isActive: true } as any })
        if (!plan) return this.replyCheckoutExpired(ctx)
        const user = await this.ensureBotUser(ctx)
        const options = await this.checkoutOptionsService.getForPlan(plan.id, PaymentMerchant.BOT, user.id)
        const methods = resolveBotCheckoutMethods(options, Boolean(state.promoCode))
        if (methods.length === 1 && methods[0] !== 'RECURRENT') {
            return this.executeCheckoutMethod(ctx, methods[0], plan.code, state.promoCode)
        }
        if (!methods.length) return this.replyCheckoutUnavailable(ctx)
        await this.renderCheckoutMethodSelection(ctx, token, plan, methods)
    }

    private async createRecurrentPaymentForState(ctx: TelegrafContext, state: BotPendingCheckout) {
        const user = await this.ensureBotUser(ctx)
        const plan = await this.planService.getOne({ where: { code: state.planCode, isActive: true } as any })
        if (!plan) return this.replyCheckoutExpired(ctx)
        const options = await this.checkoutOptionsService.getForPlan(plan.id, PaymentMerchant.BOT, user.id)
        if (!options.recurrent.available || !options.recurrent.eligible) return this.replyCheckoutUnavailable(ctx)

        const agreement = await this.recurrentAgreementService.create(
            user.id,
            { planId: plan.id, consent: true },
            this.checkoutState.recurrentKey(state),
            PaymentMerchant.BOT,
        )
        if (!agreement.redirect) return this.replyCheckoutUnavailable(ctx)

        await ctx.reply(
            `<b>Ссылка на оплату создана</b>\n\nТариф: ${this.escapeHtml(this.getPlanDisplayTitle(plan))}\nСумма: ${agreement.amount} ₽\nПосле оплаты подписка будет продлеваться автоматически.`,
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [Markup.button.url(this.buttonLabel('MENU_BUTTON_RENEW', 'Перейти к оплате'), agreement.redirect)],
                    ...buildBotPrePaymentLegalButtonRows(),
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_MY_SUBSCRIPTION', 'Моя подписка'),
                            BOT_CALLBACK.MY_SUBSCRIPTION,
                        ),
                    ],
                    [Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT)],
                ]) as any,
            ) as any,
        )
    }

    private async executeCheckoutMethod(
        ctx: TelegrafContext,
        method: BotCheckoutMethod,
        planCode: string,
        promoCode?: string,
    ) {
        if (method === 'ONE_TIME') return this.createPaymentForPlanCode(ctx, planCode, promoCode)
        if (method === 'RECURRENT') return this.replyCheckoutUnavailable(ctx)
        return this.createCryptoPaymentForPlanCode(ctx, planCode, promoCode)
    }

    private async replyCheckoutExpired(ctx: TelegrafContext) {
        return this.replyStyled(ctx, 'MENU_BUTTON_TARIFFS', 'Сессия оплаты устарела. Выберите тариф ещё раз.')
    }

    private async replyCheckoutUnavailable(ctx: TelegrafContext) {
        return this.replyStyled(
            ctx,
            'MENU_BUTTON_RENEW',
            'Оплата временно недоступна. Попробуйте позже или напишите в поддержку.',
        )
    }
    protected async showPaymentOptionsForPlanCode(ctx: TelegrafContext, planCode: string) {
        const plan = await this.planService.getOne({ where: { code: planCode, isActive: true } as any })
        if (!plan) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_TARIFFS',
                'Тариф временно недоступен, попробуйте позже или напишите в поддержку.',
            )
            return
        }

        await this.showPaymentOptionsForSelection(ctx, plan.period, Number(plan.devicesLimit || 1))
    }

    protected async showPaymentOptionsForSelection(ctx: TelegrafContext, period: number, devicesLimit: number) {
        const plan = await this.planService.findActiveByPeriodAndDevices(period, devicesLimit)
        if (!plan || !plan.code) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_TARIFFS',
                'Тариф временно недоступен, попробуйте позже или напишите в поддержку.',
            )
            return
        }

        const user = await this.ensureBotUser(ctx)
        const options = await this.checkoutOptionsService.getForPlan(plan.id, PaymentMerchant.BOT, user.id)
        const methods = resolveBotCheckoutMethods(options, false)

        await this.renderNavigationTextMessage(
            ctx,
            'renew',
            [
                `${tgEmoji('MENU_BUTTON_RENEW')} <b>Оплата тарифа ${this.escapeHtml(this.getPlanDisplayTitle(plan))}</b>`,
                `${tgEmoji('TARIFF_DEVICE_COUNT')} ${this.escapeHtml(this.getPlanDeviceLabel(plan))}`,
                `${tgEmoji('MENU_BUTTON_RENEW')} Стоимость: ${this.escapeHtml(this.formatRub(plan.amount))}`,
                `${tgEmoji('SUBSCRIPTION_EXPIRES_AT')} Срок: ${this.escapeHtml(buildPeriodLabel(plan.period))}`,
                `${tgEmoji('SUBSCRIPTION_STATUS')} Можно применить промокод или оплатить без него.`,
                `${tgEmoji('REFERRAL_TITLE')} После оплаты вы сможете приглашать друзей и получать 50% с каждой их оплаты в кошелёк.`,
            ].join('\n\n'),
            [
                [
                    Markup.button.callback(
                        this.buttonLabel('REFERRAL_ARROW', 'Ввести промокод'),
                        `${BOT_CALLBACK.PROMO_PLAN_BY_CODE_PREFIX}${plan.code}`,
                    ),
                ],
                methods.length ? [Markup.button.callback(this.buttonLabel('MENU_BUTTON_RENEW', 'Оплатить без промокода'), `${BOT_CALLBACK.PAY_PLAN_BY_CODE_PREFIX}${plan.code}`)] : null,
                ...this.buildBonusPaymentButtons(user, plan),
                [
                    Markup.button.callback(
                        this.buttonLabel('MENU_BUTTON_TARIFFS', 'Назад к устройствам'),
                        `${BOT_CALLBACK.TARIFF_DEVICE_PREFIX}${period}:${devicesLimit}`,
                    ),
                ],
                [Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT)],
            ].filter(Boolean),
        )
    }

    protected async askPromoCodeForPlan(ctx: TelegrafContext, planCode: string) {
        const user = await this.ensureBotUser(ctx)
        const plan = await this.planService.getOne({ where: { code: planCode, isActive: true } as any })
        if (!plan) {
            await this.replyStyled(
                ctx,
                'MENU_BUTTON_TARIFFS',
                'Тариф временно недоступен, попробуйте позже или напишите в поддержку.',
            )
            return
        }

        this.promoAwaitingUsers.set(String(ctx.from?.id || user.telegramId), plan.code)
        await ctx.reply(
            [
                `${tgEmoji('REFERRAL_ARROW')} <b>Промокод для ${this.escapeHtml(this.getPlanDisplayTitle(plan))}</b>`,
                'Отправьте промокод следующим сообщением.',
            ].join('\n\n'),
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_TARIFFS', 'Назад к тарифам'),
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

    protected async createPaymentForPlanCode(ctx: TelegrafContext, planCode: string, promoCode?: string) {
        const user = await this.ensureBotUser(ctx)
        const plan = await this.planService.getOne({ where: { code: planCode, isActive: true } as any })
        if (!plan) {
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
            subscription = await this.subscriptionService.create(user, plan.id)
        }

        try {
            const payment = (await this.subscriptionService.performAction(
                user,
                ActionsEnum.PAYMENT_CREATE,
                plan.id,
                promoCode,
            )) as any
            const paymentUrl = payment?.confirmation?.confirmation_url || payment?.paymentLink || null
            if (payment?.paidWithPromo) {
                await ctx.reply(
                    [
                        `${tgEmoji('MENU_BUTTON_RENEW')} <b>Тариф активирован</b>`,
                        `${tgEmoji('SUBSCRIPTION_TARIFF')} Тариф: ${this.escapeHtml(this.getPlanDisplayTitle(plan))}`,
                        promoCode
                            ? `${tgEmoji('REFERRAL_ARROW')} Промокод: ${this.escapeHtml(String(promoCode).trim().toUpperCase())}`
                            : null,
                        `${tgEmoji('SUBSCRIPTION_EXPIRES_AT')} Срок: ${this.escapeHtml(String(payment?.promo?.durationDays || plan.period))} дней`,
                        `${tgEmoji('TARIFF_DEVICE_COUNT')} Устройств: ${this.escapeHtml(String(payment?.promo?.devicesLimit || this.getPlanDeviceLabel(plan)))}`,
                        `${tgEmoji('SUBSCRIPTION_STATUS')} Доступ подключен. Откройте ссылку доступа в следующем разделе.`,
                    ]
                        .filter(Boolean)
                        .join('\n\n'),
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

            if (paymentUrl) {
                const finalAmount = payment?.finalAmount ?? plan.amount
                const promoLine =
                    promoCode && payment?.promo
                        ? `${tgEmoji('REFERRAL_ARROW')} Промокод ${this.escapeHtml(payment.promo.code)} применён: скидка ${this.escapeHtml(String(payment.promo.valuePercent))}%, к оплате ${this.escapeHtml(String(finalAmount))} ₽`
                        : null
                await ctx.reply(
                    [
                        `${tgEmoji('MENU_BUTTON_RENEW')} <b>Ссылка на оплату создана</b>`,
                        `${tgEmoji('SUBSCRIPTION_TARIFF')} Тариф: ${this.escapeHtml(this.getPlanDisplayTitle(plan))}`,
                        promoLine,
                        `${tgEmoji('MENU_BUTTON_RENEW')} Цена: ${this.escapeHtml(String(finalAmount))} ₽`,
                        `${tgEmoji('SUBSCRIPTION_EXPIRES_AT')} Срок: ${this.escapeHtml(String(payment?.promo?.durationDays || plan.period))} дней`,
                        `${tgEmoji('SUBSCRIPTION_STATUS')} После оплаты доступ подключится автоматически.`,
                        `${tgEmoji('REFERRAL_TITLE')} Приглашайте друзей и получайте 50% с каждой их оплаты в кошелёк. Двое активных друзей могут покрыть стоимость подписки.`,
                    ]
                        .filter(Boolean)
                        .join('\n\n'),
                    this.htmlReplyOptions(
                        Markup.inlineKeyboard([
                            [Markup.button.url(this.buttonLabel('MENU_BUTTON_RENEW', 'Перейти к оплате'), paymentUrl)],
                            ...buildBotPrePaymentLegalButtonRows(),
                            ...this.buildBonusPaymentButtons(user, plan),
                            [
                                Markup.button.callback(
                                    this.buttonLabel('MENU_BUTTON_RENEW', 'Я оплатил'),
                                    BOT_CALLBACK.CHECK_PAYMENT,
                                ),
                            ],
                            [
                                Markup.button.callback(
                                    this.buttonLabel('MENU_BUTTON_TARIFFS', 'Назад к тарифам'),
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
            } else {
                await ctx.reply(
                    this.styledText(
                        'MENU_BUTTON_RENEW',
                        'Платёж создан, но ссылка на оплату не вернулась. Попробуйте ещё раз или напишите в поддержку.',
                    ),
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
        } catch (e: any) {
            const mapped = mapBotCheckoutError(e)
            const correlationId = randomUUID()
            this.logger.error(
                {
                    event: 'bot_checkout_failed',
                    safeCode: mapped.safeCode,
                    correlationId,
                    planCode,
                    promoPresent: Boolean(promoCode),
                },
                undefined,
                'BotUpdate',
            )
            await ctx.reply(
                this.styledText('MENU_BUTTON_RENEW', mapped.userMessage),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('REFERRAL_ARROW', 'Ввести промокод ещё раз'),
                                `${BOT_CALLBACK.PROMO_PLAN_BY_CODE_PREFIX}${plan.code}`,
                            ),
                        ],
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_RENEW', 'Оплатить без промокода'),
                                `${BOT_CALLBACK.PAY_PLAN_BY_CODE_PREFIX}${plan.code}`,
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
    }

    protected async createCryptoPaymentForPlanCode(ctx: TelegrafContext, planCode: string, promoCode?: string) {
        const user = await this.ensureBotUser(ctx)
        const plan = await this.planService.getOne({ where: { code: planCode, isActive: true } as any })
        if (!plan) return this.replyCheckoutUnavailable(ctx)
        let subscription = await this.subscriptionService.getOne({ where: { userId: user.id }, relations: { plan: true } })
        if (!subscription) subscription = await this.subscriptionService.create(user, plan.id)
        try {
            const payment: any = await this.paymentService.createCryptoPaymentForUser(user.id, plan.id, promoCode, 'bot')
            if (payment?.paidWithPromo) {
                await ctx.reply(
                    this.styledText('MENU_BUTTON_RENEW', 'Тариф активирован. Доступ подключен.'),
                    this.htmlReplyOptions(Markup.inlineKeyboard([
                        [Markup.button.callback(this.buttonLabel('MENU_BUTTON_GET_ACCESS', 'Получить доступ'), BOT_CALLBACK.GET_ACCESS)],
                        [Markup.button.callback(this.buttonLabel('MENU_BUTTON_MY_SUBSCRIPTION', 'Моя подписка'), BOT_CALLBACK.MY_SUBSCRIPTION)],
                    ]) as any) as any,
                )
                return
            }
            const paymentUrl = payment?.confirmation?.confirmation_url || payment?.paymentLink || payment?.paymentUrl
            if (!paymentUrl) return this.replyCheckoutUnavailable(ctx)
            await ctx.reply(
                [
                    `${tgEmoji('MENU_BUTTON_RENEW')} <b>Ссылка на оплату создана</b>`,
                    `${tgEmoji('SUBSCRIPTION_TARIFF')} Тариф: ${this.escapeHtml(this.getPlanDisplayTitle(plan))}`,
                    'Способ: криптовалюта',
                    `${tgEmoji('MENU_BUTTON_RENEW')} Цена: ${this.escapeHtml(String(payment?.finalAmount ?? plan.amount))} ₽`,
                    `${tgEmoji('SUBSCRIPTION_STATUS')} После оплаты доступ подключится автоматически.`,
                ].join('\n\n'),
                this.htmlReplyOptions(Markup.inlineKeyboard([
                    [Markup.button.url(this.buttonLabel('MENU_BUTTON_RENEW', 'Перейти к оплате'), paymentUrl)],
                    ...buildBotPrePaymentLegalButtonRows(),
                    [Markup.button.callback(this.buttonLabel('MENU_BUTTON_RENEW', 'Я оплатил'), BOT_CALLBACK.CHECK_PAYMENT)],
                    [Markup.button.callback(this.buttonLabel('MENU_BUTTON_TARIFFS', 'Назад к тарифам'), BOT_CALLBACK.TARIFFS)],
                    [Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT)],
                ]) as any) as any,
            )
        } catch (error: any) {
            const mapped = mapBotCheckoutError(error)
            await this.replyStyled(ctx, 'MENU_BUTTON_RENEW', mapped.userMessage)
        }
    }

    protected buildRenewButtons(user: any, subscription: { plan?: any }) {
        const buttons = []
        if (this.isPaymentConfigured()) {
            buttons.push([
                Markup.button.callback(
                    this.buttonLabel('MENU_BUTTON_RENEW', 'Оплатить продление доступа'),
                    BOT_CALLBACK.RENEW_NOW,
                ),
            ])
        }

        if (this.canPayWithBonus(user, subscription.plan)) {
            buttons.push([
                Markup.button.callback(
                    this.buttonLabel('MENU_BUTTON_RENEW', 'Оплатить бонусами'),
                    BOT_CALLBACK.RENEW_WITH_BONUS,
                ),
            ])
        }

        if (!buttons.length) {
            buttons.push([
                Markup.button.callback(this.buttonLabel('MENU_BUTTON_SUPPORT', 'Поддержка'), BOT_CALLBACK.SUPPORT),
            ])
        }

        return buttons
    }

    protected buildBonusPaymentButtons(user: any, plan: any) {
        if (!this.canPayWithBonus(user, plan)) {
            return []
        }

        return [
            [
                Markup.button.callback(
                    this.tariffButtonLabel(plan, `Оплатить бонусами ${this.getPlanDisplayTitle(plan)}`),
                    `${BOT_CALLBACK.PAY_BONUS_PLAN_BY_CODE_PREFIX}${plan.code}`,
                ),
            ],
        ]
    }

    protected canPayWithBonus(user: any, plan: any) {
        const balance = Number(user?.referralBonusBalanceRub || 0)
        const amount = Number(plan?.amount || 0)
        return amount > 0 && balance >= amount
    }

    protected async payPlanWithBonus(ctx: TelegrafContext, planCode: string) {
        const user = await this.ensureBotUser(ctx)
        const plan = await this.planService.getOne({ where: { code: planCode, isActive: true } as any })
        if (!plan) {
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
            subscription = await this.subscriptionService.create(user, plan.id)
        }

        await this.payCurrentSubscriptionWithBonus(ctx, plan.id)
    }

    protected async payCurrentSubscriptionWithBonus(ctx: TelegrafContext, planId: string) {
        const user = await this.ensureBotUser(ctx)
        try {
            await this.subscriptionService.payWithReferralBonus(user, planId)
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_RENEW',
                    'Оплата из бонусного кошелька прошла успешно. Доступ активирован.',
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
        } catch (e: any) {
            await ctx.reply(
                this.styledText(
                    'REFERRAL_ARROW',
                    'В кошельке пока недостаточно средств для полной оплаты тарифа или списание не прошло. Выберите оплату картой или напишите в поддержку.',
                ),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_TARIFFS', 'Тарифы'),
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
    }

    protected async handleCheckPayment(ctx: TelegrafContext) {
        const user = await this.ensureBotUser(ctx)
        try {
            const result = await this.paymentService.checkLatestPendingPaymentForUser(user.id)
            await this.replyPaymentCheckResult(ctx, result)
        } catch (error: any) {
            this.logger.warn(`Payment status check failed for ${user.id}: ${error?.message || 'unknown'}`, 'BotUpdate')
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_RENEW',
                    'Не удалось проверить оплату. Попробуйте позже или напишите в поддержку.',
                ),
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

    protected async tryHandlePaymentReturnFromStart(ctx: TelegrafContext, user: any) {
        const payload = this.getStartPayload(ctx)
        if (!payload) {
            return false
        }

        const successPrefix = 'pay_success_'
        const failPrefix = 'pay_fail_'
        if (!payload.startsWith(successPrefix) && !payload.startsWith(failPrefix)) {
            return false
        }

        if (!(await this.requireOfficialChannelMembership(ctx))) {
            return true
        }

        const paymentId = payload.startsWith(successPrefix)
            ? payload.slice(successPrefix.length)
            : payload.slice(failPrefix.length)
        if (!paymentId) {
            await this.replyPaymentCheckResult(ctx, { ok: true, status: null, message: 'payment_not_found' })
            return true
        }

        try {
            const result = await this.paymentService.checkPaymentForUser(paymentId, user.id)
            await this.replyPaymentCheckResult(ctx, result)
        } catch (error: any) {
            this.logger.warn(`Payment return check failed for ${user.id}: ${error?.message || 'unknown'}`, 'BotUpdate')
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_RENEW',
                    'Не удалось проверить оплату. Попробуйте позже или напишите в поддержку.',
                ),
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

    protected async replyPaymentCheckResult(ctx: TelegrafContext, result: any) {
        if (!result?.status) {
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_RENEW',
                    'Платёж не найден. Если вы уже оплатили, подождите немного или напишите в поддержку.',
                ),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_TARIFFS', 'Тарифы'),
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
            return
        }

        if (result.status === PaymentStatusEnum.SUCCEEDED) {
            const autoRenewText =
                result.autoRenewEnabled === true
                    ? ' Автопродление включено. Управлять им можно в меню подписки.'
                    : ' Автопродление не включено.'
            await ctx.reply(
                this.styledText('MENU_BUTTON_RENEW', `Оплата прошла успешно. Доступ активирован.${autoRenewText}`),
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

        if (result.status === PaymentStatusEnum.REFUNDED) {
            await ctx.reply(
                this.styledText(
                    'MENU_BUTTON_SUPPORT',
                    'По платежу есть возврат или спорная операция. Напишите в поддержку — проверим вручную.',
                ),
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

        if (
            result.status === PaymentStatusEnum.CANCELED ||
            result.status === PaymentStatusEnum.FAILED ||
            result.status === PaymentStatusEnum.EXPIRED
        ) {
            await ctx.reply(
                this.styledText('MENU_BUTTON_RENEW', 'Оплата не завершена. Можно попробовать ещё раз.'),
                this.htmlReplyOptions(
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_RENEW', 'Оплатить заново'),
                                BOT_CALLBACK.TARIFFS,
                            ),
                        ],
                        [
                            Markup.button.callback(
                                this.buttonLabel('MENU_BUTTON_TARIFFS', 'Тарифы'),
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
            return
        }

        const text =
            result?.ok === false
                ? 'Не удалось проверить оплату прямо сейчас. Попробуйте позже или напишите в поддержку.'
                : 'Платёж пока не подтверждён. Если оплатили только что, подождите немного и нажмите проверить снова.'

        await ctx.reply(
            this.styledText('MENU_BUTTON_RENEW', text),
            this.htmlReplyOptions(
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_RENEW', 'Проверить оплату'),
                            BOT_CALLBACK.CHECK_PAYMENT,
                        ),
                    ],
                    [
                        Markup.button.callback(
                            this.buttonLabel('MENU_BUTTON_TARIFFS', 'Создать новую ссылку'),
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
    protected async handleRenewNow(ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.clearNavigationMessages(ctx, false, this.getCallbackMessageId(ctx))
        const user = await this.ensureBotUser(ctx)
        const subscription = await this.subscriptionService.getOne({
            where: { userId: user.id },
            relations: { plan: true },
        })
        if (!subscription) {
            await ctx.reply(
                this.styledText('SUBSCRIPTION_STATUS', 'Подписка пока не создана. Сначала выберите тариф.'),
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

        await this.beginExternalCheckout(ctx, subscription.plan?.code || '')
    }

    protected async handleRenewWithBonus(ctx: TelegrafContext) {
        await ctx.answerCbQuery()
        await this.clearNavigationMessages(ctx, false, this.getCallbackMessageId(ctx))
        const user = await this.ensureBotUser(ctx)
        const subscription = await this.subscriptionService.getOne({
            where: { userId: user.id },
            relations: { plan: true },
        })
        if (!subscription) {
            await ctx.reply(
                this.styledText('SUBSCRIPTION_STATUS', 'Подписка пока не создана. Сначала выберите тариф.'),
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

        await this.payCurrentSubscriptionWithBonus(ctx, subscription.planId)
    }
}
