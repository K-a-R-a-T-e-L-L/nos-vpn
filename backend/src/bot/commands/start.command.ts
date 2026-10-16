import { Injectable, Logger } from '@nestjs/common'
import { Markup } from 'telegraf'

import { TelegrafContext } from '@common/interfaces/context.interface'

import { User } from '../../system/user/entity/user.entity'
import { WELCOME_CUSTOM_EMOJI_KEYS, getCustomEmojiRefs } from '../bot-emoji-diagnostics'
import { buildPlainWelcomeMessage, buildWelcomeMessage } from '../bot-welcome'

@Injectable()
export class StartCommand {
    private readonly logger = new Logger(StartCommand.name)

    async handle(ctx: TelegrafContext, _user: User) {
        const removeKeyboard = Markup.removeKeyboard()

        try {
            return await ctx.reply(
                buildWelcomeMessage(),
                {
                    ...removeKeyboard,
                    parse_mode: 'HTML',
                } as any,
            )
        } catch (error: any) {
            this.logger.warn(
                JSON.stringify({
                    event: 'telegram formatted message fallback',
                    message: 'start/welcome',
                    error: error?.message || 'unknown',
                    customEmojiRefs: getCustomEmojiRefs(WELCOME_CUSTOM_EMOJI_KEYS),
                    recommendation: 'Run /emoji_check with TELEGRAM_CUSTOM_EMOJI_DEBUG=true',
                }),
            )
            return await ctx.reply(buildPlainWelcomeMessage(), removeKeyboard)
        }
    }
}