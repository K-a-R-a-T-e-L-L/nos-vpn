import { BotCheckoutState, resolveBotCheckoutMethods } from './bot-checkout-state'

describe('BotCheckoutState', () => {
    const options = (overrides: Record<string, any> = {}) => ({
        oneTime: { available: true },
        crypto: { available: false },
        recurrent: { available: false, eligible: false, cadence: null },
        ...overrides,
    })

    it('keeps the current one-time fast path and hides unavailable methods', () => {
        expect(resolveBotCheckoutMethods(options())).toEqual(['ONE_TIME'])
        expect(resolveBotCheckoutMethods(options({ crypto: { available: true } }))).toEqual(['ONE_TIME', 'CRYPTO'])
    })

    it('keeps the recurrent presentation with promo only when one-time fallback is available', () => {
        const recurrent = options({ recurrent: { available: true, eligible: true, cadence: 'MONTHLY' } })
        expect(resolveBotCheckoutMethods(recurrent)).toEqual(['ONE_TIME', 'RECURRENT'])
        expect(resolveBotCheckoutMethods(recurrent, true)).toEqual(['ONE_TIME', 'RECURRENT'])

        expect(
            resolveBotCheckoutMethods(
                options({
                    oneTime: { available: false },
                    recurrent: { available: true, eligible: true, cadence: 'MONTHLY' },
                }),
                true,
            ),
        ).toEqual([])
    })

    it('never exposes recurrent for an ineligible plan', () => {
        expect(
            resolveBotCheckoutMethods(
                options({ recurrent: { available: true, eligible: false, cadence: null } }),
            ),
        ).toEqual(['ONE_TIME'])
    })

    it('binds opaque checkout tokens to one Telegram actor and invalidates replacements', () => {
        const state = new BotCheckoutState()
        const first = state.begin('42', 'vpn_30_1', 'PROMO')
        expect(state.get(first.token, '42')).toMatchObject({ planCode: 'vpn_30_1', promoCode: 'PROMO' })
        expect(state.get(first.token, '43')).toBeNull()
        state.begin('42', 'vpn_360_1')
        expect(state.get(first.token, '42')).toBeNull()
    })

    it('keeps one recurrent idempotency key stable for retries of the same checkout intent', () => {
        const state = new BotCheckoutState()
        const checkout = state.begin('42', 'vpn_30_1')
        const first = state.recurrentKey(checkout)
        expect(state.recurrentKey(checkout)).toBe(first)
    })

    it('single-flights one actor without blocking another actor', async () => {
        const state = new BotCheckoutState()
        let release!: () => void
        const barrier = new Promise<void>((resolve) => (release = resolve))
        let calls = 0
        const first = state.runUserOnce('42', async () => {
            calls += 1
            await barrier
        })
        const duplicate = state.runUserOnce('42', async () => {
            calls += 1
        })
        const other = state.runUserOnce('43', async () => {
            calls += 1
        })
        expect(await duplicate).toBeNull()
        await other
        release()
        await first
        expect(calls).toBe(2)
    })
})
