import { buildMainMenuButtons, buildMainMenuMessage } from './bot-inline-menu'
import { BOT_CALLBACK, BOT_INLINE_LABEL } from './bot.constants'
import { CUSTOM_EMOJI } from './custom-emoji.registry'

function flattenButtons(buttons: any[][]) {
    return buttons.flat().map((button: any) => ({
        text: button.text,
        callbackData: button.callback_data,
    }))
}

describe('bot inline menu', () => {
    it('builds styled menu message with custom emoji html', () => {
        const message = buildMainMenuMessage()

        expect(message).toContain('<tg-emoji')
        expect(message).toContain('Всё нужное рядом.')
        expect(message).toContain('Выберите раздел ниже:')
    })

    it('builds active subscription menu labels without changing callback data', () => {
        const buttons = flattenButtons(buildMainMenuButtons(true, false))

        expect(buttons).toEqual([
            { text: BOT_INLINE_LABEL.GET_ACCESS, callbackData: BOT_CALLBACK.GET_ACCESS },
            { text: BOT_INLINE_LABEL.MY_SUBSCRIPTION, callbackData: BOT_CALLBACK.MY_SUBSCRIPTION },
            { text: BOT_INLINE_LABEL.RENEW, callbackData: BOT_CALLBACK.RENEW },
            { text: BOT_INLINE_LABEL.TARIFFS, callbackData: BOT_CALLBACK.TARIFFS },
            { text: BOT_INLINE_LABEL.REFERRAL, callbackData: BOT_CALLBACK.REFERRAL },
            { text: BOT_INLINE_LABEL.WALLET, callbackData: BOT_CALLBACK.WALLET },
            { text: BOT_INLINE_LABEL.FAQ, callbackData: BOT_CALLBACK.FAQ },
            { text: BOT_INLINE_LABEL.INFO, callbackData: BOT_CALLBACK.INFO },
            { text: BOT_INLINE_LABEL.SUPPORT, callbackData: BOT_CALLBACK.SUPPORT },
        ])
    })

    it('builds inactive menu labels and keeps trial callback data', () => {
        const buttons = flattenButtons(buildMainMenuButtons(false, true))

        expect(buttons).toEqual([
            { text: BOT_INLINE_LABEL.TARIFFS, callbackData: BOT_CALLBACK.TARIFFS },
            { text: `${CUSTOM_EMOJI.SUBSCRIPTION_TRIAL.fallback} Попробовать бесплатно`, callbackData: BOT_CALLBACK.START_TRIAL },
            { text: BOT_INLINE_LABEL.REFERRAL, callbackData: BOT_CALLBACK.REFERRAL },
            { text: BOT_INLINE_LABEL.WALLET, callbackData: BOT_CALLBACK.WALLET },
            { text: BOT_INLINE_LABEL.FAQ, callbackData: BOT_CALLBACK.FAQ },
            { text: BOT_INLINE_LABEL.INFO, callbackData: BOT_CALLBACK.INFO },
            { text: BOT_INLINE_LABEL.SUPPORT, callbackData: BOT_CALLBACK.SUPPORT },
        ])
    })

    it('uses inline buttons only', () => {
        const firstButton = buildMainMenuButtons(false, true)[0][0] as any

        expect(firstButton.callback_data).toBe(BOT_CALLBACK.TARIFFS)
        expect(firstButton).not.toHaveProperty('request_contact')
    })
})
