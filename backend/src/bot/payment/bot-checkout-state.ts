import { randomUUID } from 'crypto'

import type { PaymentRecurrentCadence } from '../../payment/dto/payment-checkout-options.dto'

export type BotCheckoutMethod = 'ONE_TIME' | 'CRYPTO' | 'RECURRENT'

export type BotCheckoutOptions = {
    oneTime: { available: boolean }
    crypto: { available: boolean }
    recurrent: { available: boolean; eligible: boolean; cadence: PaymentRecurrentCadence | null }
}

export type BotPendingCheckout = {
    token: string
    telegramUserId: string
    planCode: string
    promoCode?: string
    createdAtMs: number
    recurrentIdempotencyKey?: string
    inFlight?: boolean
}

const TTL_MS = 15 * 60 * 1000

export function resolveBotCheckoutMethods(options: BotCheckoutOptions, hasPromo = false): BotCheckoutMethod[] {
    return [
        options.oneTime.available ? 'ONE_TIME' : null,
        options.recurrent.available && options.recurrent.eligible && (!hasPromo || options.oneTime.available)
            ? 'RECURRENT'
            : null,
        options.crypto.available ? 'CRYPTO' : null,
    ].filter(Boolean) as BotCheckoutMethod[]
}

export class BotCheckoutState {
    private readonly byToken = new Map<string, BotPendingCheckout>()
    private readonly byUser = new Map<string, string>()
    private readonly userInFlight = new Set<string>()

    begin(telegramUserId: string, planCode: string, promoCode?: string) {
        this.prune()
        const prior = this.byUser.get(telegramUserId)
        if (prior) this.byToken.delete(prior)
        const state: BotPendingCheckout = { token: randomUUID(), telegramUserId, planCode, promoCode, createdAtMs: Date.now() }
        this.byToken.set(state.token, state)
        this.byUser.set(telegramUserId, state.token)
        return state
    }

    get(token: string, telegramUserId: string) {
        this.prune()
        const state = this.byToken.get(token)
        return state && state.telegramUserId === telegramUserId ? state : null
    }

    recurrentKey(state: BotPendingCheckout) {
        state.recurrentIdempotencyKey ||= randomUUID()
        return state.recurrentIdempotencyKey
    }

    async runOnce<T>(state: BotPendingCheckout, operation: () => Promise<T>) {
        if (state.inFlight) return null
        state.inFlight = true
        try {
            return await operation()
        } finally {
            state.inFlight = false
        }
    }

    async runUserOnce<T>(telegramUserId: string, operation: () => Promise<T>) {
        if (this.userInFlight.has(telegramUserId)) return null
        this.userInFlight.add(telegramUserId)
        try {
            return await operation()
        } finally {
            this.userInFlight.delete(telegramUserId)
        }
    }

    private prune() {
        const now = Date.now()
        for (const [token, state] of this.byToken) {
            if (now - state.createdAtMs <= TTL_MS) continue
            this.byToken.delete(token)
            if (this.byUser.get(state.telegramUserId) === token) this.byUser.delete(state.telegramUserId)
        }
    }
}
