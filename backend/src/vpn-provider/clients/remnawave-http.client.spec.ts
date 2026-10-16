import { Logger } from '@nestjs/common'

import { RemnawaveHttpClient } from './remnawave-http.client'
import { RemnawaveRequestError } from '../errors/remnawave-request.error'

describe('RemnawaveHttpClient safe logging', () => {
    const canaryUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const canaries = [
        canaryUuid,
        'secret@example.test',
        '987654321',
        'https://subscription.example/secret-token',
        'raw-provider-secret',
    ]
    let logSpy: jest.SpyInstance
    let warnSpy: jest.SpyInstance
    let errorSpy: jest.SpyInstance

    beforeEach(() => {
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
        warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
        errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    })

    afterEach(() => {
        jest.restoreAllMocks()
        delete (global as any).fetch
    })

    function createClient() {
        return new RemnawaveHttpClient({
            get: jest.fn((key: string) => {
                if (key === 'REMNAWAVE_BASE_URL') return 'https://remnawave.example'
                if (key === 'REMNAWAVE_API_TOKEN') return 'api-token-secret'
                if (key === 'REMNAWAVE_TIMEOUT_MS') return 1000
                return undefined
            }),
        } as any)
    }

    function serializedLogs() {
        return JSON.stringify([...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls])
    }

    it('logs only templated request metadata on success', async () => {
        ;(global as any).fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    uuid: canaryUuid,
                    email: canaries[1],
                    telegramId: canaries[2],
                    subscriptionUrl: canaries[3],
                }),
        }))
        const client = createClient()

        await client.updateUser(canaryUuid, { email: canaries[1], raw: canaries[4] })

        const logs = serializedLogs()
        for (const canary of canaries) {
            expect(logs).not.toContain(canary)
        }
        expect(logs).not.toContain('api-token-secret')
        expect(logs).toContain('event=remnawave_request_started')
        expect(logs).toContain('event=remnawave_request_finished')
        expect(logs).toContain('pathTemplate=/api/users')
    })

    it('throws a serialized-safe HTTP error without raw body', async () => {
        ;(global as any).fetch = jest.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => `raw-provider-secret ${canaryUuid}`,
        }))
        const client = createClient()

        let thrown: unknown
        try {
            await client.getUser(canaryUuid)
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(RemnawaveRequestError)
        expect(thrown).toMatchObject({
            statusCode: 500,
            category: 'HTTP_ERROR',
            method: 'GET',
            pathTemplate: '/api/users/:uuid',
        })
        const serialized = JSON.stringify(thrown)
        expect(serialized).not.toContain('raw-provider-secret')
        expect(serialized).not.toContain(canaryUuid)
        expect(serializedLogs()).not.toContain('raw-provider-secret')
        expect(serializedLogs()).not.toContain(canaryUuid)
    })

    it('classifies malformed successful JSON without preserving its body', async () => {
        ;(global as any).fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => `raw-provider-secret ${canaryUuid}`,
        }))
        const client = createClient()

        await expect(client.getUser(canaryUuid)).rejects.toMatchObject({
            category: 'INVALID_RESPONSE',
            pathTemplate: '/api/users/:uuid',
        })
        expect(serializedLogs()).not.toContain('raw-provider-secret')
        expect(serializedLogs()).not.toContain(canaryUuid)
    })

    it('classifies a network error without logging its raw message', async () => {
        ;(global as any).fetch = jest.fn(async () => {
            throw new Error(`raw-provider-secret ${canaryUuid}`)
        })
        const client = createClient()

        await expect(client.getUser(canaryUuid)).rejects.toMatchObject({
            category: 'NETWORK_ERROR',
            pathTemplate: '/api/users/:uuid',
        })
        expect(serializedLogs()).not.toContain('raw-provider-secret')
        expect(serializedLogs()).not.toContain(canaryUuid)
    })
})
