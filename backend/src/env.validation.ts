import { accessSync, constants, lstatSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'

import * as Joi from 'joi'

export const validationSchema = Joi.object({
    DATABASE_HOST: Joi.string().hostname().required(),
    DATABASE_PORT: Joi.number().port().required(),
    DATABASE_USER: Joi.string().required(),
    DATABASE_PASSWORD: Joi.string().required(),
    DATABASE_DB: Joi.string().required(),
    FRONTEND_ORIGIN: Joi.string().uri().required(),
    AUTH_COOKIE_DOMAIN: Joi.string().allow('').optional(),
    AUTH_COOKIE_SECURE: Joi.string().valid('true', 'false').optional(),
    ENABLE_SWAGGER: Joi.string().valid('true', 'false').optional(),
    DB_SYNCHRONIZE: Joi.string().valid('true', 'false').default('true'),
    JWT_REFRESH_SECRET: Joi.string().min(8).required(),
    JWT_ACCESS_SECRET: Joi.string().min(8).required(),
    JWT_ACCESS_EXPIRES: Joi.string()
        .pattern(/^\d+[smhdwy]$/)
        .required(),
    JWT_REFRESH_EXPIRES: Joi.string()
        .pattern(/^\d+[smhdwy]$/)
        .required(),
    TELEGRAM_TOKEN: Joi.string().required(),
    TELEGRAM_BOT_LAUNCH: Joi.string().valid('true', 'false').default('true'),
    TELEGRAM_BOT_USERNAME: Joi.string().allow('').optional(),
    TELEGRAM_BOT_START_URL: Joi.string().uri().allow('').optional(),
    TELEGRAM_CUSTOM_EMOJI_DEBUG: Joi.string().valid('true', 'false').default('false'),
    TELEGRAM_ADMINCHAT_ID: Joi.string().allow('').optional(),
    TELEGRAM_SUPPORT_CHAT_ID: Joi.string().trim().pattern(/^-?\d+$/).allow('').optional(),
    TELEGRAM_LOGS_CHAT_ID: Joi.string().trim().pattern(/^-?\d+$/).allow('').optional(),
    SUPPORT_MEDIA_STORAGE_ROOT: Joi.string().allow('').optional(),
    TELEGRAM_ADMIN_IDS: Joi.string().allow('').optional(),
    PRIVACY_POLICY_URL: Joi.string().uri().required(),
    TERMS_URL: Joi.string().uri().required(),
    SUPPORT_CONTACT: Joi.string().required(),
    PAYMENT_RETURN_URL: Joi.string().uri().required(),
    PAYMENT_FAIL_RETURN_URL: Joi.string().uri().allow('').optional(),
    PAYMENT_WEB_RETURN_URL: Joi.string().uri().allow('').optional(),
    PAYMENT_WEB_FAIL_RETURN_URL: Joi.string().uri().allow('').optional(),
    PAYMENT_PRIMARY_PROVIDER: Joi.string().default('PLATEGA'),
    PAYMENT_YOOKASSA_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PAYMENT_YOOKASSA_WEBHOOK_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PAYMENT_RECURRENT_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PAYMENT_ACTIVATION_RECONCILIATION_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PAYMENT_ADMIN_NOTIFICATION_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PAYMENT_YOOKASSA_STATUS_RECONCILIATION_ENABLED: Joi.string().valid('true', 'false').default('false'),
    YOOKASSA_WEBHOOK_IP_CHECK_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PAYMENT_YOOKASSA_PRODUCTION_CONFIRMED: Joi.string().valid('true', 'false').default('false'),
    PAYMENT_YOOKASSA_CANARY_USER_IDS: Joi.string().allow('').default(''),
    API_PUBLIC_ORIGIN: Joi.string().uri().allow('').optional(),
    YOOKASSA_API_BASE_URL: Joi.string().uri().default('https://api.yookassa.ru/v3'),
    YOOKASSA_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(15000),
    YOOKASSA_SITE_SHOP_ID: Joi.string().allow('').optional(),
    YOOKASSA_SITE_SECRET_KEY: Joi.string().allow('').optional(),
    YOOKASSA_BOT_SHOP_ID: Joi.string().allow('').optional(),
    YOOKASSA_BOT_SECRET_KEY: Joi.string().allow('').optional(),
    YOOKASSA_SITE_RECEIPT_MODE: Joi.string().valid('DISABLED', 'YOOKASSA').default('DISABLED'),
    YOOKASSA_SITE_VAT_CODE: Joi.number().integer().min(1).max(12).optional(),
    YOOKASSA_SITE_PAYMENT_SUBJECT: Joi.string().allow('').optional(),
    YOOKASSA_SITE_PAYMENT_MODE: Joi.string().allow('').optional(),
    YOOKASSA_BOT_RECEIPT_MODE: Joi.string().valid('DISABLED', 'YOOKASSA').default('DISABLED'),
    YOOKASSA_BOT_VAT_CODE: Joi.number().integer().min(1).max(12).optional(),
    YOOKASSA_BOT_PAYMENT_SUBJECT: Joi.string().allow('').optional(),
    YOOKASSA_BOT_PAYMENT_MODE: Joi.string().allow('').optional(),
    PLATEGA_BASE_URL: Joi.string().uri().default('https://app.platega.io/'),
    PLATEGA_CRYPTO_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PLATEGA_PAYMENT_URL_ALLOWED_HOSTS: Joi.string()
        .default('pay.platega.io')
        .custom((value, helpers) => {
            const hosts = String(value || '')
                .split(',')
                .map((host) => host.trim().toLowerCase())
                .filter(Boolean)
            if (!hosts.length || hosts.some((host) => host.includes('*') || !/^[a-z0-9.-]+$/i.test(host))) {
                return helpers.error('string.hostname')
            }
            return [...new Set(hosts)].join(',')
        }),
    PLATEGA_RECURRENT_ENABLED: Joi.string().valid('true', 'false').default('false'),
    PLATEGA_MERCHANT_ID: Joi.string().required(),
    PLATEGA_SECRET: Joi.string().required(),
    PLATEGA_WEB_MERCHANT_ID: Joi.string().allow('').optional(),
    PLATEGA_WEB_SECRET: Joi.string().allow('').optional(),
    REMNAWAVE_BASE_URL: Joi.string().uri().required(),
    REMNAWAVE_API_TOKEN: Joi.string().required(),
    REMNAWAVE_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
    REMNAWAVE_DEFAULT_NODE_CODE: Joi.string().default('remnawave-default'),
    REMNAWAVE_SUBSCRIPTION_PUBLIC_BASE_URL: Joi.string().uri().allow('').optional(),
    REMNAWAVE_DEFAULT_SQUAD_UUID: Joi.string().allow('').optional(),
    REMNAWAVE_PRESERVED_INTERNAL_SQUAD_UUIDS: Joi.string()
        .allow('')
        .default('')
        .custom((value, helpers) => {
            const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            const values = [
                ...new Set(
                    String(value || '')
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                ),
            ]
            if (values.some((item) => !uuidV4.test(item))) {
                return helpers.error('string.guid')
            }
            return values.join(',')
        }),
}).custom((env, helpers) => {
    if (env.NODE_ENV === 'production') {
        const supportMediaRoot = String(env.SUPPORT_MEDIA_STORAGE_ROOT || '').trim()
        if (!supportMediaRoot || !isAbsolute(supportMediaRoot)) {
            return helpers.error('any.custom', { message: 'SUPPORT_MEDIA_STORAGE_ROOT must be an absolute path in production' })
        }
        try {
            const resolvedRoot = resolve(supportMediaRoot)
            const publicRoots = [resolve(process.cwd(), 'public'), resolve(process.cwd(), 'dist'), resolve(process.cwd(), 'src')]
            const isInsideApplicationPath = (root: string) => {
                const pathFromRoot = relative(root, resolvedRoot)
                return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
            }
            if (publicRoots.some(isInsideApplicationPath)) {
                return helpers.error('any.custom', { message: 'SUPPORT_MEDIA_STORAGE_ROOT must not be inside an application-served path' })
            }
            const metadata = lstatSync(resolvedRoot)
            accessSync(resolvedRoot, constants.R_OK | constants.W_OK)
            if (!metadata.isDirectory()) throw new Error('not a directory')
        } catch {
            return helpers.error('any.custom', { message: 'SUPPORT_MEDIA_STORAGE_ROOT must be a readable writable directory in production' })
        }
        const supportChatId = String(env.TELEGRAM_SUPPORT_CHAT_ID || '').trim()
        const logsChatId = String(env.TELEGRAM_LOGS_CHAT_ID || '').trim()
        if (!supportChatId) {
            return helpers.error('any.custom', { message: 'TELEGRAM_SUPPORT_CHAT_ID is required in production' })
        }
        if (!logsChatId) {
            return helpers.error('any.custom', { message: 'TELEGRAM_LOGS_CHAT_ID is required in production' })
        }
        if (supportChatId === logsChatId) {
            return helpers.error('any.custom', { message: 'Telegram support and logs chat ids must differ in production' })
        }
    }
    const yookassaRuntimeEnabled =
        String(env.PAYMENT_PRIMARY_PROVIDER).toUpperCase() === 'YOOKASSA' ||
        env.PAYMENT_YOOKASSA_ENABLED === 'true' ||
        env.PAYMENT_YOOKASSA_WEBHOOK_ENABLED === 'true' ||
        env.PAYMENT_RECURRENT_ENABLED === 'true'
    if (env.NODE_ENV === 'production' && yookassaRuntimeEnabled) {
        if (env.PAYMENT_YOOKASSA_PRODUCTION_CONFIRMED !== 'true') {
            return helpers.error('any.custom', { message: 'YooKassa production confirmation is required' })
        }
        if (env.YOOKASSA_API_BASE_URL !== 'https://api.yookassa.ru/v3') {
            return helpers.error('any.custom', { message: 'Official YooKassa API URL is required' })
        }
        for (const key of [
            'YOOKASSA_SITE_SHOP_ID',
            'YOOKASSA_SITE_SECRET_KEY',
            'YOOKASSA_BOT_SHOP_ID',
            'YOOKASSA_BOT_SECRET_KEY',
        ]) {
            if (!String(env[key] || '').trim()) {
                return helpers.error('any.custom', { message: `${key} is required` })
            }
        }
        for (const merchant of ['SITE', 'BOT']) {
            const modeKey = `YOOKASSA_${merchant}_RECEIPT_MODE`
            if (!process.env[modeKey]) {
                return helpers.error('any.custom', { message: `${modeKey} must be explicitly set` })
            }
            if (env[modeKey] === 'YOOKASSA') {
                for (const suffix of ['VAT_CODE', 'PAYMENT_SUBJECT', 'PAYMENT_MODE']) {
                    const key = `YOOKASSA_${merchant}_${suffix}`
                    if (!String(env[key] || '').trim()) {
                        return helpers.error('any.custom', { message: `${key} is required` })
                    }
                }
            }
        }
        for (const key of ['PAYMENT_WEB_RETURN_URL', 'PAYMENT_RETURN_URL', 'API_PUBLIC_ORIGIN']) {
            if (!String(env[key] || '').startsWith('https://')) {
                return helpers.error('any.custom', { message: `${key} must use HTTPS` })
            }
        }
    }
    return env
})
