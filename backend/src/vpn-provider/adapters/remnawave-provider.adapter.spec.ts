import { Logger } from '@nestjs/common'

import { RemnawaveProviderAdapter } from './remnawave-provider.adapter'

describe('RemnawaveProviderAdapter preserved squads', () => {
    const main = '11111111-1111-4111-8111-111111111111'
    const testLab = '22222222-2222-4222-8222-222222222222'
    const commercial = '33333333-3333-4333-8333-333333333333'
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
    })

    function createHarness(existing: any) {
        const client = {
            getUser: jest.fn(async () => existing),
            getUserByUsername: jest.fn(async () => existing),
            updateUser: jest.fn(async (_uuid, payload) => ({
                ...existing,
                activeInternalSquads: payload.activeInternalSquads.map((uuid: string) => ({ uuid })),
            })),
            createUser: jest.fn(async (payload) => ({
                uuid: '44444444-4444-4444-8444-444444444444',
                ...payload,
                activeInternalSquads: payload.activeInternalSquads.map((uuid: string) => ({ uuid })),
            })),
            updateUserInternalSquads: jest.fn(async () => undefined),
        }
        const config = {
            get: jest.fn((key: string) => {
                if (key === 'REMNAWAVE_DEFAULT_SQUAD_UUID') return main
                if (key === 'REMNAWAVE_PRESERVED_INTERNAL_SQUAD_UUIDS') return testLab
                return undefined
            }),
        }
        return {
            adapter: new RemnawaveProviderAdapter(client as any, config as any),
            client,
        }
    }

    const input = {
        operationKey: 'operation-1',
        userKey: 'safe-user',
        providerExternalId: '44444444-4444-4444-8444-444444444444',
        providerClientKey: 'safe-user',
        inboundKey: 'main',
        expiresAt: new Date('2026-08-29T00:00:00.000Z'),
        hwidDeviceLimit: 3,
    }

    it('preserves TEST-LAB for an existing member and removes an old commercial squad', async () => {
        const { adapter, client } = createHarness({
            uuid: input.providerExternalId,
            username: input.userKey,
            activeInternalSquads: [{ uuid: main }, { uuid: testLab }, { uuid: commercial }],
        })

        await adapter.ensureAccess(input)

        expect(client.updateUser).toHaveBeenCalledWith(
            input.providerExternalId,
            expect.objectContaining({
                activeInternalSquads: [main, testLab],
                hwidDeviceLimit: 3,
                expireAt: input.expiresAt.toISOString(),
            }),
            undefined,
        )
    })

    it('does not add TEST-LAB to an existing nonmember', async () => {
        const { adapter, client } = createHarness({
            uuid: input.providerExternalId,
            username: input.userKey,
            activeInternalSquads: [{ uuid: commercial }],
        })

        await adapter.ensureAccess(input)

        expect(client.updateUser.mock.calls[0][1].activeInternalSquads).toEqual([main])
    })

    it('assigns only MAIN to a new user', async () => {
        const { adapter, client } = createHarness(null)
        client.getUserByUsername.mockResolvedValueOnce(null)
        client.getUser.mockResolvedValueOnce({
            uuid: '44444444-4444-4444-8444-444444444444',
            activeInternalSquads: [{ uuid: main }],
        })

        await adapter.ensureAccess({ ...input, providerExternalId: undefined })

        expect(client.createUser.mock.calls[0][0].activeInternalSquads).toEqual([main])
    })

    it('uses the same target set in the fallback membership update', async () => {
        const { adapter, client } = createHarness({
            uuid: input.providerExternalId,
            username: input.userKey,
            activeInternalSquads: [{ uuid: main }, { uuid: testLab }],
        })
        client.updateUser.mockResolvedValueOnce({
            uuid: input.providerExternalId,
            username: input.userKey,
            activeInternalSquads: [{ uuid: main }],
        })

        await adapter.ensureAccess(input)

        expect(client.updateUserInternalSquads).toHaveBeenCalledWith(
            input.providerExternalId,
            [main, testLab],
            undefined,
        )
    })

    it('does not log provider identifiers, contacts, squad UUIDs or payloads', async () => {
        const emailCanary = 'secret@example.test'
        const telegramCanary = '987654321'
        const { adapter } = createHarness({
            uuid: input.providerExternalId,
            username: input.userKey,
            activeInternalSquads: [{ uuid: main }, { uuid: testLab }],
        })

        await adapter.ensureAccess({
            ...input,
            email: emailCanary,
            telegramId: telegramCanary,
        })

        const logs = JSON.stringify([...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls])
        for (const canary of [
            input.providerExternalId,
            input.providerClientKey,
            input.inboundKey,
            input.userKey,
            main,
            testLab,
            emailCanary,
            telegramCanary,
        ]) {
            expect(logs).not.toContain(canary)
        }
    })
})
