import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import {
    BOT_LEGAL_DETAILS,
    BOT_LEGAL_URLS,
    buildBotLegalButtonRows,
    buildBotLegalInfoText,
    buildBotPrePaymentLegalButtonRows,
} from './bot-legal'
import { BOT_OFFICIAL_CHANNEL } from './bot.constants'

const readBotImplementation = (directory = __dirname): string =>
    readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const entryPath = join(directory, entry.name)
            if (entry.isDirectory()) {
                return readBotImplementation(entryPath)
            }
            return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
                ? [readFileSync(entryPath, 'utf8')]
                : []
        })
        .join('\n')

describe('bot legal presenter', () => {
    it('uses authoritative operator details and site routes', () => {
        expect(BOT_LEGAL_DETAILS).toEqual({
            operator: 'Администрация сервиса NOS VPN',
            website: 'https://vpn.example.invalid',
            telegramBot: 'https://t.me/your_vpn_bot',
            telegramSupportUsername: '@your_support_username',
            telegramSupportUrl: 'https://t.me/your_support_username',
            effectiveDate: '10 сентября 2026 года',
            version: '2.1',
        })
        expect(BOT_LEGAL_URLS).toEqual({
            terms: 'https://vpn.example.invalid/terms',
            privacy: 'https://vpn.example.invalid/privacy',
            refund: 'https://vpn.example.invalid/refund',
            contacts: 'https://vpn.example.invalid/contacts',
        })
        expect(buildBotLegalInfoText()).toContain('@your_support_username')
        expect(buildBotLegalInfoText()).not.toMatch(/\b(?:ИП|ООО)\b|Email:|ИНН/)
        expect(buildBotLegalInfoText()).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{10,12}\b/i)
    })

    it('builds complete info/help and pre-payment URL keyboards', () => {
        const legalUrls = buildBotLegalButtonRows()
            .flat()
            .map((button: any) => button.url)
        const paymentUrls = buildBotPrePaymentLegalButtonRows()
            .flat()
            .map((button: any) => button.url)

        expect(legalUrls).toEqual([...Object.values(BOT_LEGAL_URLS), BOT_OFFICIAL_CHANNEL.url])
        expect(paymentUrls).toEqual([BOT_LEGAL_URLS.terms, BOT_LEGAL_URLS.privacy, BOT_LEGAL_URLS.refund])
    })

    it('is integrated into info, FAQ and both payment-link keyboards without recurrent payment wiring', () => {
        const source = readBotImplementation()

        expect(source).toContain('buildBotLegalInfoText')
        expect(source.match(/(?<!function )buildBotLegalButtonRows\(\)/g)).toHaveLength(2)
        expect(source.match(/(?<!function )buildBotPrePaymentLegalButtonRows\(\)/g)).toHaveLength(3)
        expect(source).not.toMatch(/paymentMethod\s*:\s*6/)
    })

    it('keeps the default one-time Platega request contract while allowing only the server-owned crypto mode', () => {
        const source = readFileSync(join(__dirname, '../payment/providers/platega-payment.provider.ts'), 'utf8')

        expect(source).toContain("'/v2/transaction/process'")
        expect(source).toContain("isCrypto ? '/transaction/process' : '/v2/transaction/process'")
        expect(source).toContain('if (isCrypto) body.paymentMethod = 13')
        expect(source).not.toMatch(/paymentMethod\s*:\s*6|Platega.*recurrent/i)
    })
})
