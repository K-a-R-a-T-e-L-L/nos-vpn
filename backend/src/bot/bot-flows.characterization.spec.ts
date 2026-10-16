import { BOT_CALLBACK } from './bot.constants'
import { BotUpdate } from './bot.update'
import { ActionsEnum } from '../subscription/enum/actions.enum'
import { StatusesEnum } from '../subscription/enum/statuses.enum'

const makeContext = (overrides: Record<string, any> = {}) =>
    ({
        from: { id: 42, username: 'tester', first_name: 'Test' },
        chat: { id: 42 },
        message: { message_id: 10, text: '' },
        reply: jest.fn().mockResolvedValue({ message_id: 11 }),
        replyWithPhoto: jest.fn().mockResolvedValue({ message_id: 12 }),
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        telegram: { deleteMessage: jest.fn(), getMe: jest.fn().mockResolvedValue({ username: 'nos_test_bot' }) },
        ...overrides,
    }) as any

const makeBot = (overrides: Record<string, any> = {}) => {
    const dependencies = {
        userService: {
            ensureTelegramUser: jest.fn().mockResolvedValue({ id: 'user-1', telegramId: '42' }),
            ensureTelegramUserWithMetadata: jest.fn().mockResolvedValue({ user: { id: 'user-1', telegramId: '42' } }),
            getUserByTelegramId: jest.fn().mockResolvedValue({ id: 'user-1' }),
            linkTelegramByStartPayload: jest.fn().mockResolvedValue(undefined),
            confirmTelegramAuthByStartPayload: jest.fn(),
            findBroadcastRecipients: jest.fn().mockResolvedValue([]),
        },
        logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        startCommand: { handle: jest.fn() },
        subscriptionService: {
            getResolvedForUser: jest.fn(),
            getResolvedById: jest.fn(),
            getOne: jest.fn(),
            create: jest.fn(),
            performAction: jest.fn(),
        },
        accessPresentationService: { buildPayload: jest.fn() },
        planService: {
            getOne: jest.fn(),
            getPublicCatalog: jest.fn(),
            findActiveByPeriod: jest.fn(),
            findActiveByPeriodAndDevices: jest.fn(),
        },
        referralService: { getReferralStats: jest.fn(), attachReferrer: jest.fn() },
        paymentService: { checkLatestPendingPaymentForUser: jest.fn(), checkPaymentForUser: jest.fn(), createCryptoPaymentForUser: jest.fn() },
        checkoutOptionsService: { getForPlan: jest.fn().mockResolvedValue({ oneTime: { available: true }, crypto: { available: false }, recurrent: { available: false, eligible: false, cadence: null } }) },
        recurrentAgreementService: { create: jest.fn() },
        supportService: { createUserMessage: jest.fn(), createAdminReply: jest.fn() },
        configService: {
            get: jest.fn(
                (key: string) =>
                    ({
                        PAYMENT_RETURN_URL: 'https://vpn.example.invalid/payment',
                        PLATEGA_MERCHANT_ID: 'merchant',
                        PLATEGA_SECRET: 'secret',
                        TELEGRAM_ADMIN_IDS: '42',
                    })[key],
            ),
        },
        navigationService: { get: jest.fn(), set: jest.fn(), patch: jest.fn(), clear: jest.fn() },
        analyticsService: { trackAccessViewed: jest.fn(), trackQrOpened: jest.fn(), trackBotStart: jest.fn() },
        telegramBot: {
            telegram: {
                copyMessage: jest.fn(),
                getMe: jest.fn().mockResolvedValue({ username: 'nos_test_bot' }),
                getChatMember: jest.fn().mockResolvedValue({ status: 'member' }),
            },
        },
        autoRenewService: { get: jest.fn().mockResolvedValue({ enabled: false, nextPaymentAt: null, method: null }) },
        ...overrides,
    }

    const bot = new BotUpdate(
        dependencies.userService as any,
        dependencies.logger as any,
        dependencies.startCommand as any,
        dependencies.subscriptionService as any,
        dependencies.accessPresentationService as any,
        dependencies.planService as any,
        dependencies.referralService as any,
        dependencies.paymentService as any,
        dependencies.checkoutOptionsService as any,
        dependencies.recurrentAgreementService as any,
        dependencies.supportService as any,
        dependencies.configService as any,
        dependencies.navigationService as any,
        dependencies.analyticsService as any,
        dependencies.telegramBot as any,
        dependencies.autoRenewService as any,
    ) as any

    return { bot, dependencies }
}

const flattenCallbackData = (rows: any[][]) => rows.flat().map((button) => button.callback_data || button.url)

describe('extracted bot flows characterization', () => {
    it.each([
        ['member', { status: 'member' }, true],
        ['administrator', { status: 'administrator' }, true],
        ['creator', { status: 'creator' }, true],
        ['active restricted member', { status: 'restricted', is_member: true }, true],
        ['inactive restricted member', { status: 'restricted', is_member: false }, false],
        ['left member', { status: 'left' }, false],
        ['kicked member', { status: 'kicked' }, false],
        ['unknown member status', { status: 'pending' }, false],
    ])('applies official channel policy for %s', async (_label, member, expected) => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.telegramBot.telegram.getChatMember.mockResolvedValue(member)

        await expect(bot.hasOfficialChannelMembership(ctx)).resolves.toBe(expected)
        expect(dependencies.telegramBot.telegram.getChatMember).toHaveBeenCalledWith('@your_vpn_channel', 42)
    })

    it('fails closed with friendly retry UI when the Telegram membership lookup rejects', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.telegramBot.telegram.getChatMember.mockRejectedValue(new Error('raw Telegram provider failure'))

        await expect(bot.requireOfficialChannelMembership(ctx)).resolves.toBe(false)

        expect(ctx.reply.mock.calls[0][0]).toContain('Не удалось проверить подписку')
        expect(ctx.reply.mock.calls[0][0]).not.toContain('raw Telegram provider failure')
        expect(flattenCallbackData(ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard)).toEqual([
            BOT_CALLBACK.CHANNEL_CHECK,
            'https://t.me/your_vpn_channel',
            BOT_CALLBACK.SUPPORT,
        ])
    })

    it('blocks historical users from /start and menu navigation when current status is left', async () => {
        const { bot, dependencies } = makeBot()
        const startReply = jest.fn().mockResolvedValue({ message_id: 11 })
        const startCtx = makeContext({ reply: startReply })
        dependencies.telegramBot.telegram.getChatMember.mockResolvedValue({ status: 'left' })

        await bot.start(startCtx)
        expect(startReply.mock.calls.at(-1)[0]).toContain('Остался один шаг')

        const menuReply = jest.fn().mockResolvedValue({ message_id: 11 })
        const menuCtx = makeContext({ reply: menuReply })
        await bot.mainMenuFromMenu(menuCtx)
        expect(menuReply.mock.calls[0][0]).toContain('Остался один шаг')
    })

    it('blocks old direct customer callbacks before their protected handlers execute', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.telegramBot.telegram.getChatMember.mockResolvedValue({ status: 'left' })
        bot.showTariffs = jest.fn()
        bot.handleRenewNow = jest.fn()

        await bot.tariffsCallback(ctx)
        await bot.renewNowCallback(ctx)

        expect(bot.showTariffs).not.toHaveBeenCalled()
        expect(bot.handleRenewNow).not.toHaveBeenCalled()
    })

    it('returns a historical user to the existing main menu after channel:check succeeds', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.telegramBot.telegram.getChatMember.mockResolvedValue({ status: 'member' })

        await bot.channelCheckCallback(ctx)

        expect(ctx.answerCbQuery).toHaveBeenCalledWith('✅ Подписка подтверждена')
        expect(ctx.reply.mock.calls[0][0]).toContain('Всё нужное рядом.')
    })

    it('keeps temporary web credentials before the membership gate for a newly provisioned user', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.userService.ensureTelegramUserWithMetadata.mockResolvedValue({
            user: { id: 'user-1', telegramId: '42' },
            temporaryCredentials: { login: 'tg_42@telegram.local', password: 'test-password' },
        })
        dependencies.telegramBot.telegram.getChatMember.mockResolvedValue({ status: 'left' })
        dependencies.startCommand.handle.mockResolvedValue({ message_id: 10 })

        await bot.startNewUserCallback(ctx)

        expect(dependencies.userService.ensureTelegramUserWithMetadata).toHaveBeenCalled()
        expect(ctx.reply.mock.calls[0][0]).toContain('Данные для входа на сайт')
        expect(ctx.reply.mock.calls[1][0]).toContain('Остался один шаг')
    })

    it('leaves the pre-auth account-choice start path ungated', async () => {
        const { bot, dependencies } = makeBot()
        const reply = jest.fn().mockResolvedValue({ message_id: 11 })
        const ctx = makeContext({ reply })
        dependencies.userService.getUserByTelegramId.mockResolvedValue(null)

        await bot.start(ctx)

        expect(dependencies.telegramBot.telegram.getChatMember).not.toHaveBeenCalled()
        expect(reply.mock.calls[0][0]).toContain('Как вам удобнее начать?')
    })

    it('resolves identity before membership checks on historical navigation and protected callbacks', async () => {
        const { bot, dependencies } = makeBot()
        const menuCtx = makeContext()
        dependencies.telegramBot.telegram.getChatMember.mockResolvedValue({ status: 'left' })

        await bot.mainMenuFromMenu(menuCtx)
        expect(dependencies.userService.ensureTelegramUser.mock.invocationCallOrder[0]).toBeLessThan(
            dependencies.telegramBot.telegram.getChatMember.mock.invocationCallOrder[0],
        )

        const tariffCtx = makeContext()
        bot.showTariffs = jest.fn()
        await bot.tariffsCallback(tariffCtx)
        expect(dependencies.userService.ensureTelegramUser.mock.invocationCallOrder[1]).toBeLessThan(
            dependencies.telegramBot.telegram.getChatMember.mock.invocationCallOrder[1],
        )
        expect(bot.showTariffs).not.toHaveBeenCalled()
    })

    it('keeps support exempt from the membership lookup', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()

        await bot.supportFromMenu(ctx)

        expect(dependencies.telegramBot.telegram.getChatMember).not.toHaveBeenCalled()
    })

    it('preserves tariff device button order and callback_data', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.planService.findActiveByPeriod.mockResolvedValue([
            { id: 'p1', period: 30, devicesLimit: 1, amount: 199 },
            { id: 'p3', period: 30, devicesLimit: 3, amount: 399 },
        ])
        bot.renderNavigationTextMessage = jest.fn()

        await bot.showTariffDevices(ctx, 30, 1)

        const rows = bot.renderNavigationTextMessage.mock.calls[0][3]
        expect(flattenCallbackData(rows)).toEqual([
            `${BOT_CALLBACK.TARIFF_DEVICE_PREFIX}30:1`,
            `${BOT_CALLBACK.TARIFF_DEVICE_PREFIX}30:3`,
            `${BOT_CALLBACK.TARIFF_CONTINUE_PREFIX}30:1`,
            BOT_CALLBACK.TARIFFS,
        ])
    })

    it('preserves one-time checkout arguments and payment keyboard order', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        const user = { id: 'user-1', telegramId: '42', bonusBalanceRub: 0 }
        const plan = { id: 'plan-1', code: 'vpn_1', title: 'VPN 1', period: 30, devicesLimit: 1, amount: 199 }
        dependencies.userService.ensureTelegramUser.mockResolvedValue(user)
        dependencies.planService.getOne.mockResolvedValue(plan)
        dependencies.subscriptionService.getOne.mockResolvedValue({ id: 'sub-1', plan })
        dependencies.subscriptionService.performAction.mockResolvedValue({
            confirmation: { confirmation_url: 'https://pay.example/one-time' },
            finalAmount: 149,
            promo: { code: 'SAVE', valuePercent: 25 },
        })

        await bot.createPaymentForPlanCode(ctx, plan.code, 'SAVE')

        expect(dependencies.subscriptionService.performAction).toHaveBeenCalledWith(
            user,
            ActionsEnum.PAYMENT_CREATE,
            plan.id,
            'SAVE',
        )
        const options = ctx.reply.mock.calls[0][1]
        expect(flattenCallbackData(options.reply_markup.inline_keyboard)).toEqual([
            'https://pay.example/one-time',
            'https://vpn.example.invalid/terms',
            'https://vpn.example.invalid/privacy',
            'https://vpn.example.invalid/refund',
            BOT_CALLBACK.CHECK_PAYMENT,
            BOT_CALLBACK.TARIFFS,
            BOT_CALLBACK.SUPPORT,
        ])
    })

    it('renders three payment choices on one screen with Telegram button styles and the exact recurrent notice', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        const plan = { id: 'plan-30', code: 'vpn_30_1', title: 'VPN 30', period: 30, devicesLimit: 1, amount: 199 }
        dependencies.planService.getOne.mockResolvedValue(plan)
        dependencies.checkoutOptionsService.getForPlan.mockResolvedValue({
            oneTime: { available: true },
            crypto: { available: true },
            recurrent: { available: true, eligible: true, cadence: 'MONTHLY' },
        })

        await bot.beginExternalCheckout(ctx, plan.code)

        const [text, options] = ctx.reply.mock.calls[0]
        expect(text).toContain('При оплате через СБП подключается автоматическое продление подписки посредством рекуррентных платежей.')
        expect(text).not.toContain('Подтвердить автопродление')
        const rows = options.reply_markup.inline_keyboard
        expect(rows[0][0]).toEqual(
            expect.objectContaining({ text: 'Оплатить через СБП', style: 'success' }),
        )
        expect(rows[0][0].callback_data).toMatch(/^pm:rec:review:/)
        expect(rows[1][0]).toEqual(
            expect.objectContaining({ text: 'Оплатить криптой', style: 'primary' }),
        )
        expect(rows[1][0].callback_data).toMatch(/^pm:crypto:/)
        expect(rows[2][0]).toEqual(expect.objectContaining({ text: 'Оплатить (без автосписаний)' }))
        expect(rows[2][0].style).toBeUndefined()
        expect(rows[2][0].callback_data).toMatch(/^pm:one:/)
    })

    it('creates recurrent checkout immediately from the SBP button without a second confirmation screen', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        const user = { id: 'user-1', telegramId: '42', bonusBalanceRub: 0 }
        const plan = { id: 'plan-30', code: 'vpn_30_1', title: 'VPN 30', period: 30, devicesLimit: 1, amount: 199 }
        dependencies.userService.ensureTelegramUser.mockResolvedValue(user)
        dependencies.planService.getOne.mockResolvedValue(plan)
        dependencies.checkoutOptionsService.getForPlan.mockResolvedValue({
            oneTime: { available: true },
            crypto: { available: true },
            recurrent: { available: true, eligible: true, cadence: 'MONTHLY' },
        })
        dependencies.recurrentAgreementService.create.mockResolvedValue({
            amount: 199,
            redirect: 'https://pay.example/recurrent',
        })

        await bot.beginExternalCheckout(ctx, plan.code)
        const recurrentCallback = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data
        const token = recurrentCallback.slice(BOT_CALLBACK.PAYMENT_METHOD_RECURRENT_REVIEW_PREFIX.length)

        await bot.handleCheckoutMethod(ctx, token, 'RECURRENT')

        expect(dependencies.recurrentAgreementService.create).toHaveBeenCalledWith(
            user.id,
            { planId: plan.id, consent: true },
            expect.any(String),
            expect.anything(),
        )
        expect(dependencies.subscriptionService.performAction).not.toHaveBeenCalled()
        const resultText = ctx.reply.mock.calls[1][0]
        expect(resultText).toContain('Ссылка на оплату создана')
        expect(resultText).toContain('После оплаты подписка будет продлеваться автоматически.')
        expect(resultText).not.toContain('Подтвердить автопродление')
    })

    it('keeps the same SBP presentation with promo but executes ordinary one-time checkout underneath', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        const plan = { id: 'plan-30', code: 'vpn_30_1', title: 'VPN 30', period: 30, devicesLimit: 1, amount: 199 }
        dependencies.planService.getOne.mockResolvedValue(plan)
        dependencies.checkoutOptionsService.getForPlan.mockResolvedValue({
            oneTime: { available: true },
            crypto: { available: true },
            recurrent: { available: true, eligible: true, cadence: 'MONTHLY' },
        })
        const ordinary = jest.fn().mockResolvedValue(undefined)
        bot.createPaymentForPlanCode = ordinary

        await bot.beginExternalCheckout(ctx, plan.code, 'PROMO')
        const [text, options] = ctx.reply.mock.calls[0]
        expect(text).toContain('Промокод будет применён при оплате.')
        expect(text).toContain('При оплате через СБП подключается автоматическое продление подписки посредством рекуррентных платежей.')
        const recurrentCallback = options.reply_markup.inline_keyboard[0][0].callback_data
        expect(options.reply_markup.inline_keyboard[0][0]).toEqual(
            expect.objectContaining({ text: 'Оплатить через СБП', style: 'success' }),
        )
        const token = recurrentCallback.slice(BOT_CALLBACK.PAYMENT_METHOD_RECURRENT_REVIEW_PREFIX.length)

        await bot.handleCheckoutMethod(ctx, token, 'RECURRENT')

        expect(ordinary).toHaveBeenCalledWith(ctx, plan.code, 'PROMO')
        expect(dependencies.recurrentAgreementService.create).not.toHaveBeenCalled()
    })

    it('keeps the one-time fast path for plans without recurrent or crypto checkout', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        const plan = { id: 'plan-90', code: 'vpn_90_1', title: 'VPN 90', period: 90, devicesLimit: 1, amount: 499 }
        dependencies.planService.getOne.mockResolvedValue(plan)
        dependencies.checkoutOptionsService.getForPlan.mockResolvedValue({
            oneTime: { available: true },
            crypto: { available: false },
            recurrent: { available: false, eligible: false, cadence: null },
        })
        const ordinary = jest.fn().mockResolvedValue(undefined)
        bot.createPaymentForPlanCode = ordinary

        await bot.beginExternalCheckout(ctx, plan.code)
        await bot.beginExternalCheckout(ctx, plan.code, 'PROMO')

        expect(ordinary).toHaveBeenCalledWith(ctx, plan.code, undefined)
        expect(ordinary).toHaveBeenCalledWith(ctx, plan.code, 'PROMO')
    })

    it('preserves direct access delivery, analytics and QR callback', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.subscriptionService.getResolvedById.mockResolvedValue({ status: StatusesEnum.ACTIVE })
        dependencies.accessPresentationService.buildPayload.mockResolvedValue({
            deliveryMode: 'DIRECT_URL',
            status: StatusesEnum.ACTIVE,
            planTitle: 'VPN 1',
            planCode: 'vpn_1',
            expiresAt: '2026-10-06T00:00:00.000Z',
            subscriptionUrl: 'https://access.example/subscription',
        })

        await bot.sendAccessMessage(ctx, 'sub-1')

        expect(dependencies.accessPresentationService.buildPayload).toHaveBeenCalledWith(
            'sub-1',
            expect.objectContaining({ status: StatusesEnum.ACTIVE }),
        )
        expect(dependencies.analyticsService.trackAccessViewed).toHaveBeenCalledWith('user-1', {
            channel: 'telegram',
            subscriptionId: 'sub-1',
        })
        expect(flattenCallbackData(ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard)).toEqual([
            BOT_CALLBACK.GET_ACCESS_QR,
            BOT_CALLBACK.SUPPORT,
        ])
    })

    it('preserves trial action and subsequent access delivery', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        const user = { id: 'user-1', telegramId: '42', hasUsedTrial: false }
        dependencies.userService.ensureTelegramUser
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({ ...user, subscription: { id: 'sub-1' } })
        dependencies.subscriptionService.getResolvedForUser.mockResolvedValue(null)
        dependencies.planService.findActiveByPeriodAndDevices.mockResolvedValue({ id: 'trial-plan' })
        dependencies.subscriptionService.getOne.mockResolvedValue({ id: 'sub-1' })
        bot.sendAccessMessage = jest.fn()

        await bot.tryStartTrialFlow(ctx)

        expect(dependencies.subscriptionService.performAction).toHaveBeenCalledWith(user, ActionsEnum.TRIAL_START)
        expect(bot.sendAccessMessage).toHaveBeenCalledWith(ctx, 'sub-1', ['✅ Бесплатный доступ активирован на 3 дня.'])
    })

    it('preserves subscription status presentation and action callbacks', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.subscriptionService.getResolvedForUser.mockResolvedValue({
            status: StatusesEnum.ACTIVE,
            expiresAt: '2026-10-06T00:00:00.000Z',
            plan: { title: 'VPN 1' },
        })

        await bot.handleMySubscription(ctx)

        expect(ctx.reply.mock.calls[0][0]).toContain('<b>Моя подписка</b>')
        expect(ctx.reply.mock.calls[0][0]).toContain('VPN 1')
        expect(flattenCallbackData(ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard)).toEqual([
            BOT_CALLBACK.GET_ACCESS,
            BOT_CALLBACK.RENEW,
            BOT_CALLBACK.TARIFFS,
            BOT_CALLBACK.SUPPORT,
        ])
    })

    it('preserves referral wallet values and navigation buttons', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.referralService.getReferralStats.mockResolvedValue({
            bonusBalanceRub: 150,
            totalBonusRub: 300,
            invitedCount: 4,
            invitedPaidCount: 2,
            activeInvitedCount: 1,
        })

        await bot.showWallet(ctx)

        expect(ctx.reply.mock.calls[0][0]).toContain('Баланс: 150 ₽')
        expect(ctx.reply.mock.calls[0][0]).toContain('Приглашено пользователей: 4')
        expect(flattenCallbackData(ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard)).toEqual([
            BOT_CALLBACK.REFERRAL,
            BOT_CALLBACK.TARIFFS,
        ])
    })

    it('preserves Telegram link payload and continue callback', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext({ startPayload: 'link_token-1' })

        await expect(bot.tryHandleTelegramLinkFromStart(ctx)).resolves.toBe(true)

        expect(dependencies.userService.linkTelegramByStartPayload).toHaveBeenCalledWith(
            'link_token-1',
            expect.objectContaining({ id: 42, username: 'tester' }),
        )
        expect(flattenCallbackData(ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard)).toEqual([
            BOT_CALLBACK.TELEGRAM_LINK_CONTINUE,
        ])
    })

    it('preserves Telegram web-auth confirmation and continue callback', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext({ startPayload: 'auth_token-1' })
        dependencies.userService.confirmTelegramAuthByStartPayload.mockResolvedValue({})

        await expect(bot.tryHandleTelegramAuthFromStart(ctx)).resolves.toBe(true)

        expect(dependencies.userService.confirmTelegramAuthByStartPayload).toHaveBeenCalledWith(
            'auth_token-1',
            expect.objectContaining({ id: 42, username: 'tester' }),
        )
        expect(ctx.reply.mock.calls[0][0]).toContain('<b>Вход подтверждён</b>')
        expect(flattenCallbackData(ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard)).toEqual([
            BOT_CALLBACK.TELEGRAM_LINK_CONTINUE,
        ])
    })

    it('preserves formatted-access error fallback and logging', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        ctx.reply.mockRejectedValueOnce(new Error('Telegram HTML rejected')).mockResolvedValueOnce({ message_id: 11 })
        dependencies.subscriptionService.getResolvedById.mockResolvedValue({ status: StatusesEnum.ACTIVE })
        dependencies.accessPresentationService.buildPayload.mockResolvedValue({
            deliveryMode: 'DIRECT_URL',
            status: StatusesEnum.ACTIVE,
            planTitle: 'VPN 1',
            planCode: 'vpn_1',
            expiresAt: '2026-10-06T00:00:00.000Z',
            subscriptionUrl: 'https://access.example/subscription',
        })

        await bot.sendAccessMessage(ctx, 'sub-1')

        expect(ctx.reply).toHaveBeenCalledTimes(2)
        expect(ctx.reply.mock.calls[1][0]).toContain('Доступ готов')
        expect(dependencies.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Formatted access message failed: Telegram HTML rejected'),
            'BotUpdate',
        )
    })

    it('uses a stateless ForceReply support prompt while keeping the legacy cancel callback harmless', async () => {
        const { bot } = makeBot()
        const ctx = makeContext()

        await bot.enterSupportMode(ctx)

        expect(ctx.reply.mock.calls[0][0]).toContain('Ответьте на это сообщение текстом или одной фотографией.')
        expect(ctx.reply.mock.calls[0][1].reply_markup).toEqual(expect.objectContaining({ force_reply: true, selective: true }))
        expect(bot.supportAwaitingUsers).toBeUndefined()
    })

    it('preserves admin broadcast recipients and copy semantics without Telegram network calls', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext()
        dependencies.userService.findBroadcastRecipients.mockResolvedValue([
            { telegramId: '100' },
            { telegramId: null },
            { telegramId: '200' },
        ])
        bot.adminBroadcastDrafts.set('42', { sourceChatId: 42, sourceMessageId: 10 })

        await bot.sendAdminBroadcast(ctx)

        expect(dependencies.telegramBot.telegram.copyMessage.mock.calls).toEqual([
            ['100', 42, 10],
            ['200', 42, 10],
        ])
        expect(ctx.reply).toHaveBeenCalledWith('Рассылка завершена.\nОтправлено: 2\nОшибок: 0')
    })
})
