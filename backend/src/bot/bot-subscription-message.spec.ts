import { buildSubscriptionButtons, buildSubscriptionMessage } from './bot-subscription-message'
import { BOT_CALLBACK, BOT_SUBSCRIPTION_LABEL } from './bot.constants'
import { CUSTOM_EMOJI } from './custom-emoji.registry'

function flattenButtons(buttons: any[][]) {
    return buttons.flat().map((button: any) => ({
        text: button.text,
        callbackData: button.callback_data,
    }))
}

describe('bot subscription message', () => {
    it('contains subscription custom emoji keys', () => {
        expect(CUSTOM_EMOJI.SUBSCRIPTION_TITLE).toEqual(
            expect.objectContaining({ id: '5249245047043428865', fallback: '✅' }),
        )
        expect(CUSTOM_EMOJI.SUBSCRIPTION_STATUS).toEqual(
            expect.objectContaining({ id: '5211052376781241550', fallback: '⚪' }),
        )
        expect(CUSTOM_EMOJI.SUBSCRIPTION_TARIFF).toEqual(
            expect.objectContaining({ id: '5978842609177595510', fallback: '⭐' }),
        )
        expect(CUSTOM_EMOJI.SUBSCRIPTION_EXPIRES_AT).toEqual(
            expect.objectContaining({ id: '5981043230160981261', fallback: '🕘' }),
        )
        expect(CUSTOM_EMOJI.SUBSCRIPTION_TRIAL).toEqual(
            expect.objectContaining({ id: '5818928255054385205', fallback: '🟢' }),
        )
    })

    it('builds HTML subscription message with custom emoji and escaped dynamic values', () => {
        const message = buildSubscriptionMessage({
            statusText: 'подписка закончилась, но доступ ещё активен',
            tariffText: '1 устройство <test>',
            expiresAtLabel: 'Доступен до',
            expiresAtText: '13 июня 2026 г. в 06:21',
            trialText: 'уже использован',
        })

        expect(message).toContain('<tg-emoji')
        expect(message).toContain('<b>Моя подписка</b>')
        expect(message).toContain('Статус: подписка закончилась, но доступ ещё активен')
        expect(message).toContain('Тариф: 1 устройство &lt;test&gt;')
        expect(message).toContain('Доступен до: 13 июня 2026 г. в 06:21')
        expect(message).toContain('Бесплатный старт: уже использован')
        expect(message).not.toContain('/code')
    })

    it('builds subscription buttons without changing callback data', () => {
        expect(flattenButtons(buildSubscriptionButtons())).toEqual([
            { text: BOT_SUBSCRIPTION_LABEL.GET_LINK, callbackData: BOT_CALLBACK.GET_ACCESS },
            { text: BOT_SUBSCRIPTION_LABEL.RENEW, callbackData: BOT_CALLBACK.RENEW },
            { text: BOT_SUBSCRIPTION_LABEL.CHOOSE_OTHER_TARIFF, callbackData: BOT_CALLBACK.TARIFFS },
            { text: BOT_SUBSCRIPTION_LABEL.SUPPORT, callbackData: BOT_CALLBACK.SUPPORT },
        ])
    })

    it('uses inline buttons only', () => {
        const buttons = flattenButtons(buildSubscriptionButtons())

        expect(buttons.map((button) => button.callbackData)).toEqual([
            BOT_CALLBACK.GET_ACCESS,
            BOT_CALLBACK.RENEW,
            BOT_CALLBACK.TARIFFS,
            BOT_CALLBACK.SUPPORT,
        ])
    })
})
