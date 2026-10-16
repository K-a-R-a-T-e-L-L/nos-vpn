import { existsSync } from 'fs'
import { join } from 'path'

export const SUBSCRIPTION_REMINDER_MEDIA = {
    before_7d: 'before-7d.png',
    before_3d: 'before-3d.png',
    before_1d: 'before-1d.png',
    expires_today: 'expires-today.png',
    grace_started: 'grace-started.png',
    expired_disabled: 'expired-disabled.png',
    expired_1d: 'expired-1d.png',
    expired_3d: 'expired-3d.png',
    expired_7d: 'expired-7d.png',
    manual_renewal: 'manual-renewal.png',
} as const

export type SubscriptionReminderMediaCode = keyof typeof SUBSCRIPTION_REMINDER_MEDIA

export function resolveSubscriptionReminderMediaPath(code: SubscriptionReminderMediaCode | string) {
    const filename = SUBSCRIPTION_REMINDER_MEDIA[code as SubscriptionReminderMediaCode]
    if (!filename) {
        return null
    }

    const absolutePath = join(process.cwd(), 'src', 'assets', 'subscription-reminders', filename)
    return existsSync(absolutePath) ? absolutePath : null
}
