import * as fs from 'fs'
import * as path from 'path'

import { BotUpdate } from './bot.update'

const readBotImplementation = (directory = __dirname): string =>
    fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const entryPath = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                return readBotImplementation(entryPath)
            }
            return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
                ? [fs.readFileSync(entryPath, 'utf8')]
                : []
        })
        .join('\n')

describe('Bot promo checkout wiring', () => {
    const source = readBotImplementation()

    it('keeps direct UserService checkout without an internal /api/user HTTP call', () => {
        expect(source).toContain('this.ensureBotUser(ctx)')
        expect(source).toContain('this.subscriptionService.performAction(')
        expect(source).not.toContain("'/api/user'")
        expect(source).not.toContain('"/api/user"')
        expect(source).not.toMatch(/\baxios\b/)
        expect(source).not.toMatch(/\bHttpService\b/)
    })

    it('maps checkout errors and logs only allowlisted diagnostic fields', () => {
        expect(source).toContain('mapBotCheckoutError(e)')
        expect(source).toContain("event: 'bot_checkout_failed'")
        expect(source).toContain('safeCode: mapped.safeCode')
        expect(source).toContain('promoPresent: Boolean(promoCode)')
        expect(source).not.toContain('Промокод не удалось применить')
    })

    it('clears promo input state before starting terminal checkout processing', () => {
        const clearIndex = source.indexOf('this.promoAwaitingUsers.delete(telegramUserId)')
        const checkoutIndex = source.indexOf('this.beginExternalCheckout(ctx, promoPlanCode, text)')
        expect(clearIndex).toBeGreaterThan(-1)
        expect(checkoutIndex).toBeGreaterThan(clearIndex)
    })
})

describe('Bot temporary web credentials message', () => {
    const source = readBotImplementation()
    const botUpdate = Object.create(BotUpdate.prototype) as any

    it('renders both credentials as one HTML preformatted code block', () => {
        expect(botUpdate.buildTemporaryWebCredentialsMessage('demo-login', 'demo-password')).toBe(
            [
                '<b>Данные для входа на сайт</b>',
                '<pre><code>Логин: demo-login\nПароль: demo-password</code></pre>',
                'Сохраните их сейчас, а после входа замените на свои email и пароль.',
            ].join('\n'),
        )
    })

    it('escapes HTML-sensitive characters exactly once', () => {
        const message = botUpdate.buildTemporaryWebCredentialsMessage('demo&<login>', 'pass&<word>')

        expect(message).toContain('Логин: demo&amp;&lt;login&gt;')
        expect(message).toContain('Пароль: pass&amp;&lt;word&gt;')
        expect(message).not.toContain('&amp;amp;')
        expect(message).not.toContain('demo&<login>')
        expect(message).not.toContain('pass&<word>')
    })

    it('preserves a long password in full', () => {
        const password = 'fake-long-password-'.repeat(20)

        expect(botUpdate.buildTemporaryWebCredentialsMessage('demo-login', password)).toContain(
            `Пароль: ${password}</code></pre>`,
        )
    })

    it('uses the shared helper at both production formatting sites and keeps HTML parse mode', () => {
        expect(source.match(/this\.buildTemporaryWebCredentialsMessage\(/g)).toHaveLength(2)
        expect(source).not.toMatch(/Логин: <code>\$\{this\.escapeHtml\(/)
        expect(source).not.toMatch(/Пароль: <code>\$\{this\.escapeHtml\(/)
        expect(source).toContain("parse_mode: 'HTML' as const")
    })
})
