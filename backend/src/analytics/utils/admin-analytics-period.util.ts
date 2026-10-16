export const ADMIN_ANALYTICS_TIMEZONE = 'Europe/Moscow' as const
export const ADMIN_ANALYTICS_DAY_MS = 24 * 60 * 60 * 1000

function moscowOffsetMs(value: Date): number {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ADMIN_ANALYTICS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(value)
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    const representedAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    return representedAsUtc - value.getTime() + value.getUTCMilliseconds()
}

export function moscowLocalToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): Date {
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
    let candidate = new Date(localAsUtc - moscowOffsetMs(new Date(localAsUtc)))
    candidate = new Date(localAsUtc - moscowOffsetMs(candidate))
    return candidate
}

export function parseMoscowBoundary(value: string): Date | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number)
        const result = moscowLocalToUtc(year, month, day)
        return Number.isFinite(result.getTime()) ? result : null
    }
    const local = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/)
    if (local) {
        const [, year, month, day, hour, minute, second = '0', milliseconds = '0'] = local
        return moscowLocalToUtc(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds.padEnd(3, '0')))
    }
    const result = new Date(value)
    return Number.isFinite(result.getTime()) ? result : null
}

export function moscowDateParts(value: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ADMIN_ANALYTICS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    return { year: get('year'), month: get('month'), day: get('day') }
}
