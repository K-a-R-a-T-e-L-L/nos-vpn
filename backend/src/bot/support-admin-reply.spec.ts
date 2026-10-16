import { BOT_CALLBACK } from './bot.constants'
import { BotUpdate } from './bot.update'
import { buildCustomerSupportPrompt, buildSupportAdminReplyPrompt, isCustomerSupportReplyPrompt } from './support-admin-reply'

const THREAD_A = '11111111-1111-4111-8111-111111111111'
const THREAD_B = '22222222-2222-4222-8222-222222222222'
const SUPPORT_CHAT_ID = '-1009876543210'
const BOT_ID = 9001

function makeContext(overrides: Record<string, any> = {}) {
    return {
        from: { id: 42, username: 'admin', first_name: 'Admin' },
        chat: { id: Number(SUPPORT_CHAT_ID) },
        botInfo: { id: BOT_ID },
        message: { message_id: 10, text: 'Ответ пользователю' },
        callbackQuery: { message: { chat: { id: Number(SUPPORT_CHAT_ID) } } },
        match: [BOT_CALLBACK.SUPPORT_ADMIN_REPLY_PREFIX + THREAD_A, THREAD_A],
        reply: jest.fn().mockResolvedValue({ message_id: 11 }),
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        telegram: { getMe: jest.fn().mockResolvedValue({ id: BOT_ID }) },
        ...overrides,
    } as any
}

function makeBot(overrides: Record<string, any> = {}) {
    const dependencies = {
        userService: { ensureTelegramUser: jest.fn(), findBroadcastRecipients: jest.fn().mockResolvedValue([]) },
        logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        startCommand: { handle: jest.fn() },
        subscriptionService: {}, accessPresentationService: {}, planService: {}, referralService: {}, paymentService: {},
        checkoutOptionsService: {}, recurrentAgreementService: {},
        supportService: {
            createUserMessage: jest.fn().mockResolvedValue({ notification: 'SENT' }),
            createAdminReply: jest.fn().mockResolvedValue({ thread: { id: THREAD_A }, delivery: 'SENT' }),
        },
        configService: {
            get: jest.fn((key: string) => ({
                TELEGRAM_ADMIN_IDS: '42,43',
                TELEGRAM_SUPPORT_CHAT_ID: SUPPORT_CHAT_ID,
                TELEGRAM_ADMINCHAT_ID: '-100111',
            })[key]),
        },
        navigationService: {}, analyticsService: {},
        telegramBot: { botInfo: { id: BOT_ID }, telegram: { copyMessage: jest.fn(), getChatMember: jest.fn() } },
        autoRenewService: {},
        ...overrides,
    }
    const bot = new BotUpdate(
        dependencies.userService as any, dependencies.logger as any, dependencies.startCommand as any,
        dependencies.subscriptionService as any, dependencies.accessPresentationService as any,
        dependencies.planService as any, dependencies.referralService as any, dependencies.paymentService as any,
        dependencies.checkoutOptionsService as any, dependencies.recurrentAgreementService as any,
        dependencies.supportService as any, dependencies.configService as any, dependencies.navigationService as any,
        dependencies.analyticsService as any, dependencies.telegramBot as any, dependencies.autoRenewService as any,
    ) as any
    return { bot, dependencies }
}

describe('stateless Telegram support admin replies', () => {
    it('uses only an exact human-readable bot prompt and no visible technical marker', () => {
        const prompt = buildCustomerSupportPrompt()
        expect(prompt).not.toContain('NOS_SUPPORT_CUSTOMER_INPUT_V1')
        expect(isCustomerSupportReplyPrompt(prompt)).toBe(true)
        expect(isCustomerSupportReplyPrompt(`${prompt} изменено`)).toBe(false)
    })

    it('opens customer support with a bot-authored ForceReply prompt instead of process-local awaiting state', async () => {
        const { bot } = makeBot()
        const ctx = makeContext({ from: { id: 77, username: 'customer', first_name: 'Customer' }, chat: { id: 77 } })

        await bot.enterSupportMode(ctx)

        expect(ctx.reply).toHaveBeenCalledWith(
            buildCustomerSupportPrompt(),
            expect.objectContaining({ reply_markup: expect.objectContaining({ force_reply: true, selective: true }) }),
        )
        expect(bot.supportAwaitingUsers).toBeUndefined()
    })

    it('routes a customer text reply on a fresh instance solely from the bot-authored customer prompt', async () => {
        const { bot, dependencies } = makeBot({
            userService: { ensureTelegramUser: jest.fn().mockResolvedValue({ id: 'user-1' }), findBroadcastRecipients: jest.fn() },
        })
        const ctx = makeContext({
            from: { id: 77, username: 'customer', first_name: 'Customer' },
            chat: { id: 77 },
            message: {
                message_id: 55,
                text: 'Нужна помощь',
                reply_to_message: { from: { id: BOT_ID }, text: buildCustomerSupportPrompt() },
            },
        })

        await bot.onSupportText(ctx)

        expect(dependencies.supportService.createUserMessage).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'user-1', text: 'Нужна помощь', source: 'TELEGRAM', sourceTelegramMessageId: '55' }),
        )
    })

    it('does not treat ordinary text or a human-authored customer-prompt lookalike as support', async () => {
        const { bot, dependencies } = makeBot()
        await bot.onSupportText(makeContext({ from: { id: 77 }, chat: { id: 77 }, message: { text: 'обычный текст' } }))
        await bot.onSupportText(makeContext({
            from: { id: 77 },
            chat: { id: 77 },
            message: { text: 'не принимать', reply_to_message: { from: { id: 777 }, text: buildCustomerSupportPrompt() } },
        }))

        expect(dependencies.supportService.createUserMessage).not.toHaveBeenCalled()
    })

    it('starts a valid support-chat callback with a ForceReply prompt containing the exact UUID marker', async () => {
        const { bot } = makeBot()
        const ctx = makeContext()

        await bot.supportAdminReplyStart(ctx)

        expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
        expect(ctx.reply).toHaveBeenCalledWith(
            buildSupportAdminReplyPrompt(THREAD_A),
            expect.objectContaining({ reply_markup: expect.objectContaining({ force_reply: true, selective: true }) }),
        )
    })

    it('rejects malformed callbacks and old cancel without creating a reply session or reaching SupportService', async () => {
        const { bot, dependencies } = makeBot()
        const malformed = makeContext({ match: ['support:admin_reply:not-a-uuid', 'not-a-uuid'] })
        await bot.supportAdminReplyStart(malformed)
        await bot.supportAdminReplyCancel(makeContext({ match: undefined }))

        expect(dependencies.supportService.createAdminReply).not.toHaveBeenCalled()
        expect(malformed.reply).not.toHaveBeenCalled()
    })

    it('rejects reply-start callbacks from a non-admin or a different chat', async () => {
        const { bot, dependencies } = makeBot()
        const nonAdmin = makeContext({ from: { id: 77, username: 'user', first_name: 'User' } })
        const wrongChat = makeContext({ callbackQuery: { message: { chat: { id: -100222 } } } })

        await bot.supportAdminReplyStart(nonAdmin)
        await bot.supportAdminReplyStart(wrongChat)

        expect(nonAdmin.reply).not.toHaveBeenCalled()
        expect(wrongChat.reply).not.toHaveBeenCalled()
        expect(dependencies.supportService.createAdminReply).not.toHaveBeenCalled()
    })

    it('routes a text reply from a fresh bot instance solely from the bot-authored ForceReply payload', async () => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext({
            message: {
                message_id: 10,
                text: 'Готово, попробуйте снова.',
                reply_to_message: { from: { id: BOT_ID, is_bot: true }, text: buildSupportAdminReplyPrompt(THREAD_A) },
            },
        })

        await bot.onSupportText(ctx)

        expect(dependencies.supportService.createAdminReply).toHaveBeenCalledWith(
            expect.objectContaining({
                threadId: THREAD_A,
                text: 'Готово, попробуйте снова.',
                source: 'ADMIN_BOT',
                contentKind: 'TEXT',
                adminTelegramId: 42,
                sourceTelegramChatId: SUPPORT_CHAT_ID,
            }),
        )
        expect(ctx.reply).toHaveBeenCalledWith('Ответ отправлен пользователю и сохранён в истории поддержки.')
    })

    it('never sends plain text or a human-authored lookalike prompt to a customer', async () => {
        const { bot, dependencies } = makeBot()
        await bot.onSupportText(makeContext({ message: { text: 'обычный текст' } }))
        await bot.onSupportText(makeContext({ message: { text: 'не принимать', reply_to_message: { from: { id: 777 }, text: buildSupportAdminReplyPrompt(THREAD_A) } } }))

        expect(dependencies.supportService.createAdminReply).not.toHaveBeenCalled()
    })

    it('rejects a bot-authored prompt with an invalid marker, a wrong chat, or a non-admin sender', async () => {
        const { bot, dependencies } = makeBot()
        const invalidMarker = makeContext({
            message: { text: 'ответ', reply_to_message: { from: { id: BOT_ID }, text: 'ID обращения: not-a-uuid' } },
        })
        const wrongChat = makeContext({
            chat: { id: -100222 },
            message: { text: 'ответ', reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) } },
        })
        const nonAdmin = makeContext({
            from: { id: 77, username: 'user', first_name: 'User' },
            message: { text: 'ответ', reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) } },
        })

        await bot.onSupportText(invalidMarker)
        await bot.onSupportText(wrongChat)
        await bot.onSupportText(nonAdmin)

        expect(dependencies.supportService.createAdminReply).not.toHaveBeenCalled()
    })

    it('uses each replied-to prompt UUID independently for different admins and tickets', async () => {
        const { bot, dependencies } = makeBot()
        await bot.onSupportText(makeContext({ message: { text: 'A', reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) } } }))
        await bot.onSupportText(makeContext({ from: { id: 43 }, message: { text: 'B', reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_B) } } }))

        expect(dependencies.supportService.createAdminReply).toHaveBeenNthCalledWith(1, expect.objectContaining({ threadId: THREAD_A, adminTelegramId: 42 }))
        expect(dependencies.supportService.createAdminReply).toHaveBeenNthCalledWith(2, expect.objectContaining({ threadId: THREAD_B, adminTelegramId: 43 }))
    })

    it('persists and delivers a stateless admin photo reply from the bot-authored prompt', async () => {
        const { bot, dependencies } = makeBot({
            supportService: {
                createAdminReply: jest.fn().mockResolvedValue({
                    thread: { id: THREAD_A },
                    delivery: 'SENT',
                }),
            },
        })
        const ctx = makeContext({
            message: {
                message_id: 35,
                photo: [
                    { file_id: 'small-photo', file_unique_id: 'small', width: 90, height: 90 },
                    { file_id: 'large-photo', file_unique_id: 'large', width: 1280, height: 720, file_size: 1234 },
                ],
                caption: 'Скриншот ошибки',
                reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) },
            },
        })

        await bot.onBroadcastPhoto(ctx)

        expect(dependencies.supportService.createAdminReply).toHaveBeenCalledWith(
            expect.objectContaining({
                threadId: THREAD_A,
                source: 'ADMIN_BOT',
                adminTelegramId: 42,
                contentKind: 'PHOTO',
                text: 'Скриншот ошибки',
                sourceTelegramChatId: SUPPORT_CHAT_ID,
                sourceTelegramMessageId: '35',
                attachment: {
                    telegramFileId: 'large-photo',
                    telegramFileUniqueId: 'large',
                    width: 1280,
                    height: 720,
                    fileSize: 1234,
                },
            }),
        )
        expect(ctx.reply).toHaveBeenCalledWith('Ответ отправлен пользователю и сохранён в истории поддержки.')
    })

    it.each([
        ['FAILED', 'Ответ сохранён в истории поддержки, но доставить его пользователю не удалось.'],
        ['NO_TELEGRAM_ID', 'Ответ сохранён в истории поддержки, но у пользователя нет доступного Telegram-канала для доставки.'],
    ])('uses truthful %s delivery text for an admin reply', async (delivery, expectedText) => {
        const { bot } = makeBot({
            supportService: { createAdminReply: jest.fn().mockResolvedValue({ thread: { id: THREAD_A }, delivery }) },
        })
        const ctx = makeContext({
            message: { text: 'Ответ', reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) } },
        })

        await bot.onSupportText(ctx)

        expect(ctx.reply).toHaveBeenCalledWith(expectedText)
    })

    it('shows retry only for a persisted failed admin delivery and retries the existing message UUID', async () => {
        const messageId = '33333333-3333-4333-8333-333333333333'
        const { bot, dependencies } = makeBot({
            supportService: {
                createAdminReply: jest.fn().mockResolvedValue({ thread: { id: THREAD_A }, messageId, delivery: 'FAILED' }),
                retryAdminDelivery: jest.fn().mockResolvedValue({ messageId, delivery: 'SENT' }),
            },
        })
        const replyCtx = makeContext({
            message: { text: 'Ответ', reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) } },
        })

        await bot.onSupportText(replyCtx)
        expect(JSON.stringify(replyCtx.reply.mock.calls[0][1])).toContain(`support:admin_retry:${messageId}`)

        const retryCtx = makeContext({ callbackQuery: { data: `support:admin_retry:${messageId}` } })
        await bot.supportAdminRetry(retryCtx)
        expect((dependencies.supportService as any).retryAdminDelivery).toHaveBeenCalledWith(messageId)
        expect(retryCtx.reply).toHaveBeenCalledWith('Ответ успешно доставлен пользователю.')
    })

    it('removes the retry markup after successful delivery when Telegram editing is available', async () => {
        const messageId = '33333333-3333-4333-8333-333333333333'
        const { bot } = makeBot({ supportService: { retryAdminDelivery: jest.fn().mockResolvedValue({ messageId, delivery: 'SENT' }) } })
        const editMessageReplyMarkup = jest.fn().mockResolvedValue(true)
        const ctx = makeContext({
            callbackQuery: { message: { chat: { id: Number(SUPPORT_CHAT_ID) }, message_id: 88 } },
            telegram: { editMessageReplyMarkup },
        })

        await bot.retryAdminSupportDelivery(ctx, messageId)

        expect(editMessageReplyMarkup).toHaveBeenCalledWith(Number(SUPPORT_CHAT_ID), 88, undefined, { inline_keyboard: [] })
        expect(ctx.reply).toHaveBeenCalledWith('Ответ успешно доставлен пользователю.')
    })

    it('reports already-sent and in-progress retries without claiming delivery again', async () => {
        const messageId = '33333333-3333-4333-8333-333333333333'
        const already = makeBot({ supportService: { retryAdminDelivery: jest.fn().mockResolvedValue({ messageId, delivery: 'SENT', alreadySent: true }) } }).bot
        const alreadyCtx = makeContext()
        await already.retryAdminSupportDelivery(alreadyCtx, messageId)
        expect(alreadyCtx.reply).toHaveBeenCalledWith('Ответ уже был доставлен пользователю.')

        const running = makeBot({ supportService: { retryAdminDelivery: jest.fn().mockResolvedValue({ messageId, delivery: 'FAILED', inProgress: true }) } }).bot
        const runningCtx = makeContext()
        await running.retryAdminSupportDelivery(runningCtx, messageId)
        expect(runningCtx.reply).toHaveBeenCalledWith('Доставка уже выполняется. Подождите несколько секунд.')
    })

    it('keeps successful delivery authoritative when retry markup editing fails', async () => {
        const messageId = '33333333-3333-4333-8333-333333333333'
        const { bot, dependencies } = makeBot({ supportService: { retryAdminDelivery: jest.fn().mockResolvedValue({ messageId, delivery: 'SENT' }) } })
        const ctx = makeContext({
            callbackQuery: { message: { chat: { id: Number(SUPPORT_CHAT_ID) }, message_id: 88 } },
            telegram: { editMessageReplyMarkup: jest.fn().mockRejectedValue(new Error('edit failed')) },
        })

        await bot.retryAdminSupportDelivery(ctx, messageId)

        expect(ctx.reply).toHaveBeenCalledWith('Ответ успешно доставлен пользователю.')
        expect(dependencies.logger.warn).toHaveBeenCalled()
    })

    it.each([
        ['wrong chat', { chat: { id: -100222 } }],
        ['non-admin', { from: { id: 77, username: 'user', first_name: 'User' } }],
        ['malformed UUID', { callbackQuery: { data: 'support:admin_retry:not-a-uuid' } }],
    ])('rejects %s retry context before SupportService', async (_label, overrides) => {
        const { bot, dependencies } = makeBot({ supportService: { retryAdminDelivery: jest.fn() } })
        const ctx = makeContext({ callbackQuery: { data: `support:admin_retry:${THREAD_A}` }, ...overrides })

        await bot.supportAdminRetry(ctx)

        expect((dependencies.supportService as any).retryAdminDelivery).not.toHaveBeenCalled()
    })

    it('rejects an album replying to the stateless customer prompt', async () => {
        const { bot, dependencies } = makeBot({
            userService: { ensureTelegramUser: jest.fn(), findBroadcastRecipients: jest.fn() },
            supportService: { createUserMessage: jest.fn(), createAdminReply: jest.fn() },
        })
        const ctx = makeContext({
            from: { id: 77, username: 'customer', first_name: 'Customer' },
            chat: { id: 77 },
            message: { message_id: 37, media_group_id: 'album-1', photo: [{ file_id: 'album-photo' }], reply_to_message: { from: { id: BOT_ID }, text: buildCustomerSupportPrompt() } },
        })

        await bot.onBroadcastPhoto(ctx)

        expect(ctx.reply.mock.calls.flat().join(' ')).toContain('одну фотографию без альбома')
        expect(dependencies.supportService.createUserMessage).not.toHaveBeenCalled()
    })

    it('routes a customer photo reply to the stateless prompt instead of the broadcast path', async () => {
        const { bot, dependencies } = makeBot({
            userService: { ensureTelegramUser: jest.fn().mockResolvedValue({ id: 'user-1' }), findBroadcastRecipients: jest.fn() },
            supportService: {
                createUserMessage: jest.fn().mockResolvedValue({ notification: 'SENT' }),
                createAdminReply: jest.fn(),
            },
        })
        const ctx = makeContext({
            from: { id: 77, username: 'customer', first_name: 'Customer' },
            chat: { id: 77 },
            message: {
                message_id: 36,
                photo: [{ file_id: 'customer-photo', file_unique_id: 'customer-file', width: 640, height: 480 }],
                caption: 'Не подключается',
                reply_to_message: { from: { id: BOT_ID }, text: buildCustomerSupportPrompt() },
            },
        })
        const capture = jest.spyOn(bot, 'captureAdminBroadcastDraft')

        await bot.onBroadcastPhoto(ctx)

        expect(dependencies.supportService.createUserMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-1',
                source: 'TELEGRAM',
                contentKind: 'PHOTO',
                text: 'Не подключается',
                sourceTelegramChatId: '77',
                sourceTelegramMessageId: '36',
                attachment: expect.objectContaining({ telegramFileId: 'customer-photo' }),
            }),
        )
        expect(capture).not.toHaveBeenCalled()
    })

    it('preserves a photo-only customer support message without inventing a caption', async () => {
        const { bot, dependencies } = makeBot({
            userService: { ensureTelegramUser: jest.fn().mockResolvedValue({ id: 'user-1' }), findBroadcastRecipients: jest.fn() },
            supportService: {
                createUserMessage: jest.fn().mockResolvedValue({ notification: 'SENT' }),
                createAdminReply: jest.fn(),
            },
        })
        const ctx = makeContext({
            from: { id: 77, username: 'customer', first_name: 'Customer' },
            chat: { id: 77 },
            message: { message_id: 38, photo: [{ file_id: 'customer-photo', width: 640, height: 480 }], reply_to_message: { from: { id: BOT_ID }, text: buildCustomerSupportPrompt() } },
        })

        await bot.onBroadcastPhoto(ctx)

        expect(dependencies.supportService.createUserMessage).toHaveBeenCalledWith(
            expect.objectContaining({ contentKind: 'PHOTO', text: null }),
        )
    })

    it('rejects a customer image sent as a document without persisting it or entering broadcast capture', async () => {
        const { bot, dependencies } = makeBot({
            supportService: { createUserMessage: jest.fn(), createAdminReply: jest.fn() },
        })
        const ctx = makeContext({
            from: { id: 77, username: 'customer', first_name: 'Customer' },
            chat: { id: 77 },
            message: { message_id: 39, document: { file_id: 'image-document', mime_type: 'image/png' }, reply_to_message: { from: { id: BOT_ID }, text: buildCustomerSupportPrompt() } },
        })
        const capture = jest.spyOn(bot, 'captureAdminBroadcastDraft')

        await bot.onBroadcastDocument(ctx)

        expect(ctx.reply.mock.calls.flat().join(' ')).toContain('Отправьте фото как изображение')
        expect(dependencies.supportService.createUserMessage).not.toHaveBeenCalled()
        expect(capture).not.toHaveBeenCalled()
    })

    it.each([
        ['wrong chat', { chat: { id: -100222 } }],
        ['non-admin', { from: { id: 77, username: 'user', first_name: 'User' } }],
        ['human-authored prompt', { message: { photo: [{ file_id: 'photo' }], reply_to_message: { from: { id: 777 }, text: buildSupportAdminReplyPrompt(THREAD_A) } } }],
        ['malformed marker', { message: { photo: [{ file_id: 'photo' }], reply_to_message: { from: { id: BOT_ID }, text: 'ID обращения: not-a-uuid' } } }],
    ])('does not treat an admin photo from %s as a support reply', async (_label, overrides) => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext({
            message: { photo: [{ file_id: 'photo' }], reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) } },
            ...overrides,
        })
        await bot.onBroadcastPhoto(ctx)

        expect(dependencies.supportService.createAdminReply).not.toHaveBeenCalled()
    })

    it.each([
        ['document', 'onBroadcastDocument'],
        ['video', 'onBroadcastVideo'],
        ['sticker', 'onSupportReplySticker'],
        ['voice', 'onSupportReplyVoice'],
    ])('rejects %s sent as a reply to a support prompt', async (_kind, methodName) => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext({
            message: {
                [_kind]: { file_id: _kind },
                reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) },
            },
        })

        await bot[methodName](ctx)

        expect(ctx.reply).toHaveBeenCalledWith('Сейчас в поддержке можно отправить только текст или одну фотографию с необязательной подписью.')
        expect(dependencies.supportService.createAdminReply).not.toHaveBeenCalled()
    })

    it('does not send unsupported support-prompt media into the admin broadcast draft flow', async () => {
        const { bot } = makeBot()
        const ctx = makeContext({
            message: {
                document: { file_id: 'document' },
                reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) },
            },
        })
        const capture = jest.spyOn(bot, 'captureAdminBroadcastDraft')

        await bot.onBroadcastDocument(ctx)

        expect(capture).not.toHaveBeenCalled()
    })

    it.each([
        ['document', 'onBroadcastDocument'],
        ['animation', 'onBroadcastAnimation'],
        ['video', 'onBroadcastVideo'],
        ['sticker', 'onSupportReplySticker'],
        ['voice', 'onSupportReplyVoice'],
        ['audio', 'onSupportReplyAudio'],
        ['video_note', 'onSupportReplyVideoNote'],
        ['contact', 'onSupportReplyContact'],
        ['location', 'onSupportReplyLocation'],
        ['venue', 'onSupportReplyVenue'],
        ['poll', 'onSupportReplyPoll'],
        ['dice', 'onSupportReplyDice'],
        ['story', 'onSupportReplyStory'],
    ])('rejects customer %s replying to the stateless prompt', async (kind, methodName) => {
        const { bot, dependencies } = makeBot()
        const ctx = makeContext({
            from: { id: 77, username: 'customer', first_name: 'Customer' },
            chat: { id: 77 },
            message: { [kind]: { id: kind, file_id: kind }, reply_to_message: { from: { id: BOT_ID }, text: buildCustomerSupportPrompt() } },
        })

        await bot[methodName](ctx)

        expect(ctx.reply.mock.calls.flat().join(' ')).toContain(kind === 'document' ? 'Отправьте фото как изображение' : 'текст или одну фотографию')
        expect(dependencies.supportService.createUserMessage).not.toHaveBeenCalled()
    })

    it.each([
        ['photo', 'onBroadcastPhoto'],
        ['video', 'onBroadcastVideo'],
        ['document', 'onBroadcastDocument'],
        ['animation', 'onBroadcastAnimation'],
    ])('keeps non-support %s broadcast capture behavior', async (kind, methodName) => {
        const { bot } = makeBot()
        const ctx = makeContext({ message: { message_id: 12, [kind]: kind === 'photo' ? [{ file_id: kind }] : { file_id: kind } } })
        bot.adminBroadcastAwaitingUsers.add('42')

        await bot[methodName](ctx)

        expect(ctx.reply).toHaveBeenCalledWith('Ваш пост будет выглядеть так:')
    })

    it('returns a generic support-chat error and logs technical context when reply persistence fails', async () => {
        const failure = new Error('invalid input syntax for type uuid: sensitive')
        const { bot, dependencies } = makeBot({ supportService: { createAdminReply: jest.fn().mockRejectedValue(failure) } })
        const ctx = makeContext({ message: { text: 'ответ', reply_to_message: { from: { id: BOT_ID }, text: buildSupportAdminReplyPrompt(THREAD_A) } } })

        await bot.onSupportText(ctx)

        expect(ctx.reply).toHaveBeenCalledWith('Не удалось отправить ответ. Попробуйте ещё раз, ответив на это же сообщение, или нажмите «Ответить» у обращения повторно.')
        expect(ctx.reply.mock.calls.flat().join(' ')).not.toContain('invalid input syntax')
        expect(dependencies.logger.error).toHaveBeenCalled()
    })
})
