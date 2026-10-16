import { REDACTED_VALUE, sanitizeLogString, sanitizeLogValue, sanitizeUrl } from './security-log-sanitizer'

describe('security log sanitizer', () => {
    it('redacts required sensitive metadata keys case-insensitively without mutating input', () => {
        const input = {
            authorization: 'Bearer auth-value',
            Cookie: 'session=cookie-value',
            'SET-COOKIE': 'refresh=cookie-value',
            token: 'token-value',
            access_token: 'access-token-value',
            refresh_token: 'refresh-token-value',
            accessToken: 'camel-access-token-value',
            refreshToken: 'camel-refresh-token-value',
            jwt: 'jwt-value',
            secret: 'secret-value',
            'X-Secret': 'provider-secret-value',
            password: 'password-value',
            passwordHash: 'password-hash-value',
            apiKey: 'api-key-value',
            api_key: 'underscore-api-key-value',
            telegramToken: 'telegram-token-value',
            botToken: 'bot-token-value',
            merchantSecret: 'merchant-secret-value',
            plategaSecret: 'platega-secret-value',
            remnawaveToken: 'remnawave-token-value',
            request: { path: '/api/user', method: 'GET' },
        }

        const result = sanitizeLogValue(input) as Record<string, any>

        for (const key of Object.keys(input).filter((key) => !['request'].includes(key))) {
            expect(result[key]).toBe(REDACTED_VALUE)
        }
        expect(result.request).toEqual({ path: '/api/user', method: 'GET' })
        expect(input.token).toBe('token-value')
    })

    it('redacts sensitive query values while preserving pathname, safe parameters and fragments', () => {
        expect(
            sanitizeUrl('/api/user/link?state=ready&access_token=unsafe-token&X-Secret=provider-secret#result'),
        ).toBe('/api/user/link?state=ready&access_token=[REDACTED]&X-Secret=[REDACTED]#result')
    })

    it('redacts credentials embedded in log strings and keeps non-sensitive context', () => {
        const result = sanitizeLogValue(
            'POST /api/callback?merchant=site&token=query-token authorization: Bearer header-token; cookie: sid=cookie-value; password=plain-value; jwt=aaa.bbb.ccc',
        ) as string

        expect(result).toContain('POST /api/callback?merchant=site&token=[REDACTED]')
        expect(result).toContain('merchant=site')
        expect(result).not.toContain('query-token')
        expect(result).not.toContain('header-token')
        expect(result).not.toContain('cookie-value')
        expect(result).not.toContain('plain-value')
        expect(result).not.toContain('aaa.bbb.ccc')
    })

    it('redacts sensitive quoted JSON-like fields while preserving safe serialized context', () => {
        const result = sanitizeLogString(
            'provider error: {"x-secret": "provider-secret", "status":"failed","token":"token-secret","password":"password-secret","provider":"platega"}',
        )

        expect(result).toContain('provider error:')
        expect(result).toContain('"status":"failed"')
        expect(result).toContain('"provider":"platega"')
        expect(result).toContain('"x-secret": "[REDACTED]"')
        expect(result).toContain('"token":"[REDACTED]"')
        expect(result).toContain('"password":"[REDACTED]"')
        expect(result).not.toContain('provider-secret')
        expect(result).not.toContain('token-secret')
        expect(result).not.toContain('password-secret')
    })

    it.each([
        'token=token-secret',
        '(token=token-secret)',
        '[token=token-secret]',
        '{token=token-secret}',
        'foo(token=token-secret)',
        'foo[token=token-secret]',
        'error: token=token-secret',
        'error(token=token-secret)',
    ])('redacts an unquoted sensitive value at a punctuation boundary: %s', (input) => {
        const result = sanitizeLogString(input)

        expect(result).not.toContain('token-secret')
    })

    it('preserves structural delimiters and safe trailing context after unquoted redaction', () => {
        expect(sanitizeLogString('(token=token-secret)')).toBe(`(token=${REDACTED_VALUE})`)
        expect(sanitizeLogString('[token=token-secret]')).toBe(`[token=${REDACTED_VALUE}]`)
        expect(sanitizeLogString('{token=token-secret}')).toBe(`{token=${REDACTED_VALUE}}`)

        const trailing = sanitizeLogString('token=token-secret retry=1 provider=platega')
        expect(trailing).not.toContain('token-secret')
        expect(trailing).toContain('retry=1')
        expect(trailing).toContain('provider=platega')

        const wrapped = sanitizeLogString('error(token=token-secret) retry=1')
        expect(wrapped).not.toContain('token-secret')
        expect(wrapped).toContain(')')
        expect(wrapped).toContain('retry=1')
    })

    it.each([
        'mytoken=safe-value',
        'not-token=safe-value',
        'refreshTokenBackup=safe-value',
        'passwordHint=safe-value',
        'apiKeyName=safe-value',
    ])('does not redact a larger identifier that contains a sensitive key: %s', (input) => {
        expect(sanitizeLogString(input)).toBe(input)
    })

    it('redacts an unquoted sensitive key with a double-quoted value containing spaces', () => {
        expect(sanitizeLogString('token="abc def"')).toBe(`token="${REDACTED_VALUE}"`)
    })

    it('redacts an unquoted sensitive key with a single-quoted value containing spaces', () => {
        expect(sanitizeLogString("password='my secret'")).toBe(`password='${REDACTED_VALUE}'`)
    })

    it('redacts opaque authorization and cookie header assignments', () => {
        const result = sanitizeLogString(
            'authorization: Basic dXNlcjpwYXNz; cookie: sid=abc; refresh=def; set-cookie: session=abc; HttpOnly; Secure',
        )

        for (const secret of ['dXNlcjpwYXNz', 'sid=abc', 'refresh=def', 'session=abc']) {
            expect(result).not.toContain(secret)
        }
    })

    it.each([
        'authorization: Basic dXNlcjpwYXNz',
        'authorization=Basic dXNlcjpwYXNz',
        'authorization: Bearer header-secret',
        'cookie: sid=abc; refresh=def',
        'set-cookie: session=abc; HttpOnly; Secure',
        '(cookie: sid=abc; refresh=def)',
    ])('does not leak an opaque header value: %s', (input) => {
        const result = sanitizeLogString(input)
        expect(result).toContain(REDACTED_VALUE)
        expect(result).not.toMatch(/dXNlcjpwYXNz|header-secret|sid=abc|refresh=def|session=abc/)
    })

    it('redacts a global Basic credential without an authorization key', () => {
        expect(sanitizeLogString('provider error: Basic dXNlcjpwYXNz')).toBe(`provider error: Basic ${REDACTED_VALUE}`)
    })

    it('redacts JWT-shaped strings without redacting ordinary dotted context', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ sub: 'fake-user' })).toString('base64url')
        const fakeJwt = `${header}.${payload}.fake-signature`
        const result = sanitizeLogString(
            `jwt candidate ${fakeJwt}, host=api.vpn.example.invalid, host=de-2.vpn.example.invalid, version=1.2.3, ip=1.2.3.4, file=file.name.ext, context=foo.bar.baz`,
        )

        expect(result).toContain(`jwt candidate ${REDACTED_VALUE}`)
        expect(result).not.toContain(fakeJwt)
        expect(result).toContain('host=api.vpn.example.invalid')
        expect(result).toContain('host=de-2.vpn.example.invalid')
        expect(result).toContain('version=1.2.3')
        expect(result).toContain('ip=1.2.3.4')
        expect(result).toContain('file=file.name.ext')
        expect(result).toContain('context=foo.bar.baz')
    })

    it('fully redacts valid JWT-like candidates whose signature ends with a Base64URL dash', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ sub: 'fake-user' })).toString('base64url')
        const candidate = `${header}.${payload}.fake-signature-`
        const result = sanitizeLogString(`jwt candidate ${candidate}`)

        expect(result).toContain(`jwt candidate ${REDACTED_VALUE}`)
        expect(result).not.toContain(candidate)
        expect(result).not.toContain('fake-signature-')
    })

    it('fully redacts valid JWT-like candidates whose signature ends with a Base64URL underscore', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ sub: 'fake-user' })).toString('base64url')
        const candidate = `${header}.${payload}.fake-signature_`

        expect(sanitizeLogString(`jwt candidate ${candidate}`)).toBe(`jwt candidate ${REDACTED_VALUE}`)
    })

    it.each([
        ['non-JSON payload', Buffer.from('not-json').toString('base64url')],
        ['JSON primitive payload', Buffer.from(JSON.stringify('plain-text')).toString('base64url')],
        ['JSON null payload', Buffer.from('null').toString('base64url')],
        ['JSON array payload', Buffer.from(JSON.stringify(['not', 'a', 'claim-set'])).toString('base64url')],
    ])('preserves a header-shaped dotted candidate with a %s', (_caseName, payload) => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
        const candidate = `${header}.${payload}.fake-signature`

        expect(sanitizeLogString(`provider context ${candidate}`)).toContain(candidate)
    })

    it('handles circular metadata without throwing or exposing a sensitive value', () => {
        const input: Record<string, unknown> = { apiKey: 'unsafe-key' }
        input.self = input

        expect(sanitizeLogValue(input)).toEqual({ apiKey: REDACTED_VALUE, self: '[Circular]' })
    })
})
