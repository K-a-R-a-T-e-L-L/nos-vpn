export const REDACTED_VALUE = '[REDACTED]'

const CIRCULAR_VALUE = '[Circular]'
const BINARY_VALUE = '[Binary data redacted]'

const SENSITIVE_KEYS = new Set(
    [
        'authorization',
        'cookie',
        'set-cookie',
        'token',
        'access_token',
        'refresh_token',
        'accessToken',
        'refreshToken',
        'jwt',
        'secret',
        'x-secret',
        'password',
        'passwordHash',
        'apiKey',
        'api_key',
        'telegramToken',
        'botToken',
        'merchantSecret',
        'plategaSecret',
        'remnawaveToken',
    ].map(normalizeKey),
)

const INLINE_SENSITIVE_KEY =
    '(?:authorization|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token|jwt|secret|x-secret|password|passwordHash|api[_-]?key|telegramToken|botToken|merchantSecret|plategaSecret|remnawaveToken)'
const DOUBLE_QUOTED_ASSIGNMENT = /"([^"\\]+)"(\s*:\s*)"((?:\\.|[^"\\])*)"/g
const SINGLE_QUOTED_ASSIGNMENT = /'([^'\\]+)'(\s*:\s*)'((?:\\.|[^'\\])*)'/g
const INLINE_DOUBLE_QUOTED_ASSIGNMENT = new RegExp(
    `(^|[^A-Za-z0-9_-])(${INLINE_SENSITIVE_KEY})(\\s*[:=]\\s*)"((?:\\\\.|[^"\\\\])*)"`,
    'gi',
)
const INLINE_SINGLE_QUOTED_ASSIGNMENT = new RegExp(
    `(^|[^A-Za-z0-9_-])(${INLINE_SENSITIVE_KEY})(\\s*[:=]\\s*)'((?:\\\\.|[^'\\\\])*)'`,
    'gi',
)
const OPAQUE_HEADER_ASSIGNMENT = /(^|[^A-Za-z0-9_?&-])(authorization|cookie|set-cookie)(\s*[:=]\s*)([^\n\)\]\}>]+)/gi
const JWT_LIKE_CANDIDATE = /(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2})(?=$|[^A-Za-z0-9_-])/g

function normalizeKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isSensitiveLogKey(key: string) {
    return SENSITIVE_KEYS.has(normalizeKey(key))
}

export function sanitizeUrl(rawUrl: string) {
    const queryStart = rawUrl.indexOf('?')
    if (queryStart === -1) return rawUrl

    const fragmentStart = rawUrl.indexOf('#', queryStart)
    const prefix = rawUrl.slice(0, queryStart + 1)
    const query = rawUrl.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart)
    const fragment = fragmentStart === -1 ? '' : rawUrl.slice(fragmentStart)
    const sanitizedQuery = query
        .split('&')
        .map((part) => {
            const equalsIndex = part.indexOf('=')
            const rawKey = equalsIndex === -1 ? part : part.slice(0, equalsIndex)
            let key = rawKey
            try {
                key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
            } catch {
                // Keep malformed query keys unchanged; they cannot match a known sensitive key safely.
            }
            if (!isSensitiveLogKey(key)) return part
            return `${rawKey}=${REDACTED_VALUE}`
        })
        .join('&')

    return `${prefix}${sanitizedQuery}${fragment}`
}

export function sanitizeLogString(value: string) {
    let sanitized = value.replace(DOUBLE_QUOTED_ASSIGNMENT, (match, key, separator) =>
        sanitizeQuotedAssignment(match, key, separator, '"'),
    )
    sanitized = sanitized.replace(SINGLE_QUOTED_ASSIGNMENT, (match, key, separator) =>
        sanitizeQuotedAssignment(match, key, separator, "'"),
    )

    sanitized = sanitized.replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, separator, rawKey) => {
        let key = rawKey
        try {
            key = decodeURIComponent(String(rawKey).replace(/\+/g, ' '))
        } catch {
            return match
        }
        return isSensitiveLogKey(key) ? `${separator}${rawKey}=${REDACTED_VALUE}` : match
    })

    sanitized = sanitized.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, `Bearer ${REDACTED_VALUE}`)
    sanitized = sanitized.replace(/\bBasic\s+[A-Za-z0-9._~+\/-]+=*/gi, `Basic ${REDACTED_VALUE}`)
    sanitized = sanitized.replace(
        OPAQUE_HEADER_ASSIGNMENT,
        (_match, prefix, key, separator) => `${prefix}${key}${separator}${REDACTED_VALUE}`,
    )
    sanitized = sanitized.replace(
        INLINE_DOUBLE_QUOTED_ASSIGNMENT,
        (_match, prefix, key, separator) => `${prefix}${key}${separator}"${REDACTED_VALUE}"`,
    )
    sanitized = sanitized.replace(
        INLINE_SINGLE_QUOTED_ASSIGNMENT,
        (_match, prefix, key, separator) => `${prefix}${key}${separator}'${REDACTED_VALUE}'`,
    )
    const inlinePattern = new RegExp(
        `(^|[^A-Za-z0-9_-])(${INLINE_SENSITIVE_KEY})(\\s*[:=]\\s*)((?!\\[REDACTED\\]|"\\[REDACTED\\]"|'\\[REDACTED\\]')[^\\s,;\\)\\]}>]+)`,
        'gi',
    )
    sanitized = sanitized.replace(
        inlinePattern,
        (_match, prefix, key, separator) => `${prefix}${key}${separator}${REDACTED_VALUE}`,
    )
    sanitized = sanitized.replace(JWT_LIKE_CANDIDATE, (_match, prefix, candidate) =>
        isJwtLike(candidate) ? `${prefix}${REDACTED_VALUE}` : `${prefix}${candidate}`,
    )
    return sanitized
}

function sanitizeQuotedAssignment(match: string, key: string, separator: string, quote: string) {
    return isSensitiveLogKey(key) ? `${quote}${key}${quote}${separator}${quote}${REDACTED_VALUE}${quote}` : match
}

function isJwtLike(candidate: string) {
    const parts = candidate.split('.')
    if (parts.length !== 3 || parts.some((part) => !part)) return false

    const header = decodeBase64UrlJsonObject(parts[0])
    const payload = decodeBase64UrlJsonObject(parts[1])

    return Boolean(header && payload && typeof header.alg === 'string')
}

function decodeBase64UrlJsonObject(segment: string): Record<string, unknown> | null {
    if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) return null

    try {
        const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null
    } catch {
        return null
    }
}

export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
    if (typeof value === 'string') return sanitizeLogString(value)
    if (value === null || typeof value !== 'object') return value
    if (Buffer.isBuffer(value)) return BINARY_VALUE
    if (value instanceof Date) return value.toISOString()
    if (seen.has(value)) return CIRCULAR_VALUE
    seen.add(value)

    if (value instanceof Error) {
        return {
            name: value.name,
            message: sanitizeLogString(value.message),
            ...(value.stack ? { stack: sanitizeLogString(value.stack) } : {}),
        }
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeLogValue(item, seen))
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
            key,
            isSensitiveLogKey(key) ? REDACTED_VALUE : sanitizeLogValue(entry, seen),
        ]),
    )
}
