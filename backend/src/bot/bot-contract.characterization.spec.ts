import * as fs from 'fs'
import * as path from 'path'

import { BOT_CALLBACK } from './bot.constants'

const readBotSources = (directory = __dirname): string =>
    fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const entryPath = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                return readBotSources(entryPath)
            }
            if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
                return []
            }
            return [fs.readFileSync(entryPath, 'utf8')]
        })
        .join('\n')

describe('Bot external contract characterization', () => {
    const updateSource = fs.readFileSync(path.join(__dirname, 'bot.update.ts'), 'utf8')
    const botSources = readBotSources()

    it('keeps the complete callback_data contract stable', () => {
        expect(BOT_CALLBACK).toEqual({
            START_TARIFFS: 'start:tariffs',
            START_TRY_FREE: 'start:try_free',
            START_HAS_SUBSCRIPTION: 'start:has_subscription',
            START_NEW_USER: 'start:new_user',
            START_LINK_SITE_ACCOUNT: 'start:link_site_account',
            TELEGRAM_LINK_CONTINUE: 'telegram_link:continue',
            CHANNEL_CHECK: 'channel:check',
            TARIFFS: 'menu:tariffs',
            MY_SUBSCRIPTION: 'menu:my_subscription',
            GET_ACCESS: 'menu:get_access',
            GET_ACCESS_QR: 'menu:get_access_qr',
            RENEW: 'menu:renew',
            REFERRAL: 'menu:referral',
            WALLET: 'menu:wallet',
            FAQ: 'menu:faq',
            INFO: 'menu:info',
            SUPPORT: 'menu:support',
            BACK: 'menu:back',
            BUY_PLAN_BY_CODE_PREFIX: 'buy_code:',
            BUY_PLAN_DIRECT_BY_CODE_PREFIX: 'buy_direct_code:',
            PAY_PLAN_BY_CODE_PREFIX: 'pay_code:',
            PROMO_PLAN_BY_CODE_PREFIX: 'promo_code:',
            PAY_BONUS_PLAN_BY_CODE_PREFIX: 'bonus_buy_code:',
            TARIFF_PERIOD_PREFIX: 'tariff_period:',
            TARIFF_DEVICE_PREFIX: 'tariff_device:',
            TARIFF_CONTINUE_PREFIX: 'tariff_continue:',
            START_TRIAL: 'trial:start',
            RENEW_NOW: 'renew:now',
            RENEW_WITH_BONUS: 'renew:bonus',
            CHECK_PAYMENT: 'payment:check',
            PAYMENT_METHOD_ONE_PREFIX: 'pm:one:',
            PAYMENT_METHOD_CRYPTO_PREFIX: 'pm:crypto:',
            PAYMENT_METHOD_RECURRENT_REVIEW_PREFIX: 'pm:rec:review:',
            PAYMENT_METHOD_RECURRENT_CONFIRM_PREFIX: 'pm:rec:confirm:',
            PAYMENT_METHOD_BACK_PREFIX: 'pm:back:',
            AUTO_RENEW_ENABLE: 'auto_renew:enable',
            AUTO_RENEW_DISABLE: 'auto_renew:disable',
            SUPPORT_BEGIN: 'support:begin',
            SUPPORT_CANCEL: 'support:cancel',
            SUPPORT_ADMIN_REPLY_PREFIX: 'support:admin_reply:',
            SUPPORT_ADMIN_REPLY_CANCEL: 'support:admin_reply:cancel',
            SUPPORT_ADMIN_RETRY_PREFIX: 'support:admin_retry:',
            ADMIN_BROADCAST_SEND: 'admin:broadcast:send',
            ADMIN_BROADCAST_CANCEL: 'admin:broadcast:cancel',
        })
    })

    it('keeps all transport handlers on BotUpdate', () => {
        expect(updateSource.match(/@(Start|Command|Action|Hears|On)\b/g)).toHaveLength(78)
        expect(updateSource.match(/@Action\b/g)).toHaveLength(44)
        expect(updateSource).toContain("@Command('my_subscription')")
        expect(updateSource).toContain("@Command('get_access')")
        expect(updateSource).toContain("@Command('info')")
        expect(updateSource).toContain("@Command('broadcast')")
        expect(updateSource).toContain('@Action(/^tariff_continue:(.+)$/)')
        expect(updateSource).toContain('@Action(/^promo_code:(.+)$/)')
        expect(updateSource).toContain('@Action(/^bonus_buy_code:(.+)$/)')
        expect(updateSource).toContain('SUPPORT_ADMIN_RETRY_PREFIX')
        for (const mediaType of ['photo', 'contact', 'dice', 'location', 'poll', 'venue']) {
            expect(updateSource).toContain(`@On('${mediaType}')`)
        }
    })

    it('keeps purchase and payment service calls and diagnostic fallbacks', () => {
        expect(botSources).toContain('this.subscriptionService.performAction(')
        expect(botSources).toContain('ActionsEnum.PAYMENT_CREATE')
        expect(botSources).toContain('mapBotCheckoutError(e)')
        expect(botSources).toContain("event: 'bot_checkout_failed'")
        expect(botSources).toContain('promoPresent: Boolean(promoCode)')
        expect(botSources).toContain('BOT_CALLBACK.CHECK_PAYMENT')
    })

    it('keeps start, linking, access, support, legal and admin observable fragments', () => {
        for (const fragment of [
            'this.startCommand.handle(ctx,',
            'linkTelegramByStartPayload',
            'confirmTelegramAuthByStartPayload',
            'buildAccessReadyButtons',
            'replyWithPhoto',
            'buildBotLegalButtonRows',
            'createUserMessage',
            'findBroadcastRecipients',
            'Не удалось обработать сообщение. Попробуйте ещё раз.',
        ]) {
            expect(botSources).toContain(fragment)
        }
    })
})
