import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { validationSchema } from './env.validation'

describe('REMNAWAVE_PRESERVED_INTERNAL_SQUAD_UUIDS validation', () => {
    const schema = validationSchema.extract('REMNAWAVE_PRESERVED_INTERNAL_SQUAD_UUIDS')
    const first = '11111111-1111-4111-8111-111111111111'
    const second = '22222222-2222-4222-8222-222222222222'

    it('trims and deduplicates UUID v4 values', () => {
        const result = schema.validate(` ${first}, ${second},${first} `)
        expect(result.error).toBeUndefined()
        expect(result.value).toBe(`${first},${second}`)
    })

    it('accepts an empty allowlist', () => {
        expect(schema.validate('').error).toBeUndefined()
    })

    it.each(['not-a-uuid', '11111111-1111-3111-8111-111111111111', '11111111-1111-4111-7111-111111111111'])(
        'rejects malformed or non-v4 UUID %s',
        (value) => {
            expect(schema.validate(value).error).toBeDefined()
        },
    )
})

describe('PLATEGA_RECURRENT_ENABLED validation', () => {
    const schema = validationSchema.extract('PLATEGA_RECURRENT_ENABLED')

    it('defaults recurrent Platega to disabled', () => {
        expect(schema.validate(undefined)).toMatchObject({ value: 'false' })
    })

    it.each(['true', 'false'])('accepts %s', (value) => {
        expect(schema.validate(value).error).toBeUndefined()
    })

    it('rejects non-boolean strings', () => {
        expect(schema.validate('yes').error).toBeDefined()
    })
})

describe('YooKassa production ordinary checkout validation', () => {
    const supportMediaRoot = mkdtempSync(join(tmpdir(), 'nosvpn-env-support-media-'))
    const productionEnv = {
        NODE_ENV: 'production',
        DATABASE_HOST: 'db.example', DATABASE_PORT: 5432, DATABASE_USER: 'user', DATABASE_PASSWORD: 'password', DATABASE_DB: 'vpn',
        FRONTEND_ORIGIN: 'https://site.example', JWT_REFRESH_SECRET: 'refresh-secret', JWT_ACCESS_SECRET: 'access-secret',
        JWT_ACCESS_EXPIRES: '1h', JWT_REFRESH_EXPIRES: '30d', TELEGRAM_TOKEN: 'telegram-token', PRIVACY_POLICY_URL: 'https://site.example/privacy',
        TERMS_URL: 'https://site.example/terms', SUPPORT_CONTACT: '@support', PAYMENT_RETURN_URL: 'https://bot.example/pay/',
        PAYMENT_WEB_RETURN_URL: 'https://site.example/pay/', REMNAWAVE_BASE_URL: 'https://vpn.example', REMNAWAVE_API_TOKEN: 'token',
        PLATEGA_MERCHANT_ID: 'platega-bot', PLATEGA_SECRET: 'platega-secret', PAYMENT_PRIMARY_PROVIDER: 'PLATEGA',
        PAYMENT_YOOKASSA_ENABLED: 'true', PAYMENT_YOOKASSA_WEBHOOK_ENABLED: 'false', PAYMENT_RECURRENT_ENABLED: 'false',
        API_PUBLIC_ORIGIN: 'https://api.example', YOOKASSA_API_BASE_URL: 'https://api.yookassa.ru/v3',
        YOOKASSA_SITE_SHOP_ID: 'site-shop', YOOKASSA_SITE_SECRET_KEY: 'site-secret', YOOKASSA_BOT_SHOP_ID: 'bot-shop', YOOKASSA_BOT_SECRET_KEY: 'bot-secret',
        YOOKASSA_SITE_RECEIPT_MODE: 'DISABLED', YOOKASSA_BOT_RECEIPT_MODE: 'DISABLED', PAYMENT_YOOKASSA_PRODUCTION_CONFIRMED: 'true',
        TELEGRAM_SUPPORT_CHAT_ID: '-100200', TELEGRAM_LOGS_CHAT_ID: '-100300', SUPPORT_MEDIA_STORAGE_ROOT: supportMediaRoot,
    }

    beforeEach(() => {
        process.env.YOOKASSA_SITE_RECEIPT_MODE = 'DISABLED'
        process.env.YOOKASSA_BOT_RECEIPT_MODE = 'DISABLED'
    })

    afterEach(() => {
        delete process.env.YOOKASSA_SITE_RECEIPT_MODE
        delete process.env.YOOKASSA_BOT_RECEIPT_MODE
    })

    afterAll(() => {
        rmSync(supportMediaRoot, { recursive: true, force: true })
    })

    it('rejects enabled ordinary YooKassa checkout without production confirmation', () => {
        const { error } = validationSchema.validate({ ...productionEnv, PAYMENT_YOOKASSA_PRODUCTION_CONFIRMED: 'false' }, { allowUnknown: true })
        expect(error).toBeDefined()
    })

    it('rejects enabled ordinary YooKassa checkout with a missing merchant credential', () => {
        const { error } = validationSchema.validate({ ...productionEnv, YOOKASSA_BOT_SECRET_KEY: '' }, { allowUnknown: true })
        expect(error).toBeDefined()
    })

    it('accepts a complete production YooKassa ordinary-checkout configuration', () => {
        const { error } = validationSchema.validate(productionEnv, { allowUnknown: true })
        expect(error).toBeUndefined()
    })

    it.each([
        ['missing support chat', { TELEGRAM_SUPPORT_CHAT_ID: '' }],
        ['missing logs chat', { TELEGRAM_LOGS_CHAT_ID: '' }],
        ['equal support and logs chats', { TELEGRAM_LOGS_CHAT_ID: '-100200' }],
    ])('rejects production configuration with %s', (_label, overrides) => {
        const { error } = validationSchema.validate({ ...productionEnv, ...overrides }, { allowUnknown: true })
        expect(error).toBeDefined()
    })

    it.each([
        ['missing storage root', { SUPPORT_MEDIA_STORAGE_ROOT: '' }],
        ['relative storage root', { SUPPORT_MEDIA_STORAGE_ROOT: 'support-media' }],
        ['unusable storage root', { SUPPORT_MEDIA_STORAGE_ROOT: join(supportMediaRoot, 'missing') }],
        ['application source directory', { SUPPORT_MEDIA_STORAGE_ROOT: join(process.cwd(), 'src') }],
    ])('rejects production configuration with invalid media storage: %s', (_label, overrides) => {
        const { error } = validationSchema.validate({ ...productionEnv, ...overrides }, { allowUnknown: true })
        expect(error).toBeDefined()
    })
})
