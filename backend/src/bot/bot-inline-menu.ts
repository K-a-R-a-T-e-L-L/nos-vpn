import { Markup } from 'telegraf'

import { BOT_CALLBACK, BOT_INLINE_LABEL } from './bot.constants'
import { CUSTOM_EMOJI, tgEmoji } from './custom-emoji.registry'

export function buildMainMenuMessage() {
    return [
        `${tgEmoji('WELCOME_HELP')} Всё нужное рядом.`,
        '',
        'Выберите раздел ниже:',
    ].join('\n')
}

export function buildMainMenuButtons(activeSubscription: boolean, trialAvailable: boolean) {
    return activeSubscription
        ? [
              [Markup.button.callback(BOT_INLINE_LABEL.GET_ACCESS, BOT_CALLBACK.GET_ACCESS)],
              [
                  Markup.button.callback(BOT_INLINE_LABEL.MY_SUBSCRIPTION, BOT_CALLBACK.MY_SUBSCRIPTION),
                  Markup.button.callback(BOT_INLINE_LABEL.RENEW, BOT_CALLBACK.RENEW),
              ],
              [Markup.button.callback(BOT_INLINE_LABEL.TARIFFS, BOT_CALLBACK.TARIFFS)],
              [
                  Markup.button.callback(BOT_INLINE_LABEL.REFERRAL, BOT_CALLBACK.REFERRAL),
                  Markup.button.callback(BOT_INLINE_LABEL.WALLET, BOT_CALLBACK.WALLET),
              ],
              [
                  Markup.button.callback(BOT_INLINE_LABEL.FAQ, BOT_CALLBACK.FAQ),
                  Markup.button.callback(BOT_INLINE_LABEL.INFO, BOT_CALLBACK.INFO),
              ],
              [Markup.button.callback(BOT_INLINE_LABEL.SUPPORT, BOT_CALLBACK.SUPPORT)],
          ]
        : [
              [Markup.button.callback(BOT_INLINE_LABEL.TARIFFS, BOT_CALLBACK.TARIFFS)],
              ...(trialAvailable
                  ? [[Markup.button.callback(`${CUSTOM_EMOJI.SUBSCRIPTION_TRIAL.fallback} Попробовать бесплатно`, BOT_CALLBACK.START_TRIAL)]]
                  : []),
              [
                  Markup.button.callback(BOT_INLINE_LABEL.REFERRAL, BOT_CALLBACK.REFERRAL),
                  Markup.button.callback(BOT_INLINE_LABEL.WALLET, BOT_CALLBACK.WALLET),
              ],
              [
                  Markup.button.callback(BOT_INLINE_LABEL.FAQ, BOT_CALLBACK.FAQ),
                  Markup.button.callback(BOT_INLINE_LABEL.INFO, BOT_CALLBACK.INFO),
              ],
              [Markup.button.callback(BOT_INLINE_LABEL.SUPPORT, BOT_CALLBACK.SUPPORT)],
          ]
}
