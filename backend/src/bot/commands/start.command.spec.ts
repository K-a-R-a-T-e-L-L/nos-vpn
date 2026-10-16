import { Markup } from 'telegraf'

import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { buildPlainWelcomeMessage, buildWelcomeMessage } from '../bot-welcome'
import { StartCommand } from './start.command'

describe('StartCommand', () => {
    function createCtx(replyImpl = jest.fn(async () => ({}))) {
        return { reply: replyImpl } as any
    }

    it.each([
        ['without subscription', {}],
        ['with ACTIVE subscription', { subscription: { status: StatusesEnum.ACTIVE } }],
        ['with GRACE subscription', { subscription: { status: StatusesEnum.GRACE } }],
    ])('sends the same welcome message for %s and removes old reply keyboard', async (_label, user) => {
        const command = new StartCommand()
        const ctx = createCtx()

        await command.handle(ctx, user as any)

        expect(ctx.reply).toHaveBeenCalledWith(
            buildWelcomeMessage(),
            {
                ...Markup.removeKeyboard(),
                parse_mode: 'HTML',
            },
        )
        expect(ctx.reply.mock.calls[0][0]).not.toContain('VPN уже подключён')
        expect(ctx.reply.mock.calls[0][1]?.reply_markup).toEqual({ remove_keyboard: true })
        expect(ctx.reply.mock.calls[0][1]?.reply_markup?.keyboard).toBeUndefined()
    })

    it('falls back to plain welcome message when Telegram rejects custom emoji HTML', async () => {
        const reply = jest
            .fn()
            .mockRejectedValueOnce(new Error('400: Bad Request: DOCUMENT_INVALID'))
            .mockResolvedValueOnce({})
        const command = new StartCommand()
        const ctx = createCtx(reply)

        await command.handle(ctx, {} as any)

        expect(reply).toHaveBeenCalledTimes(2)
        expect(reply).toHaveBeenNthCalledWith(1, buildWelcomeMessage(), expect.objectContaining({ parse_mode: 'HTML' }))
        expect(reply).toHaveBeenNthCalledWith(2, buildPlainWelcomeMessage(), Markup.removeKeyboard())
        expect(reply.mock.calls[1][0]).not.toContain('<tg-emoji')
        expect(reply.mock.calls[1][1]?.reply_markup).toEqual({ remove_keyboard: true })
        expect(reply.mock.calls[1][1]?.reply_markup?.keyboard).toBeUndefined()
    })
})