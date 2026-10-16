import { Injectable } from '@nestjs/common'

export type BotNavigationSection =
    | 'main_menu'
    | 'get_access'
    | 'my_subscription'
    | 'renew'
    | 'tariffs'
    | 'referral'
    | 'wallet'
    | 'faq'
    | 'support'
    | 'info'

export type BotNavigationState = {
    welcomeMessageId?: number
    navigationMessageId?: number
    navigationMessageIds?: number[]
    section?: BotNavigationSection
    updatedAt: Date
}

@Injectable()
export class BotNavigationService {
    private readonly state = new Map<string, BotNavigationState>()

    get(telegramId?: string | number | null) {
        if (!telegramId) {
            return null
        }

        return this.state.get(String(telegramId)) || null
    }

    set(telegramId: string | number, state: Omit<BotNavigationState, 'updatedAt'>) {
        this.state.set(String(telegramId), { ...state, updatedAt: new Date() })
    }

    patch(telegramId: string | number, patch: Partial<Omit<BotNavigationState, 'updatedAt'>>) {
        const key = String(telegramId)
        const current = this.state.get(key)
        this.state.set(key, { ...current, ...patch, updatedAt: new Date() })
    }

    clear(telegramId?: string | number | null) {
        if (!telegramId) {
            return
        }

        this.state.delete(String(telegramId))
    }
}
