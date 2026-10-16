export enum AdminProviderFilter {
    ALL = 'ALL',
    YOOKASSA = 'YOOKASSA',
    PLATEGA = 'PLATEGA',
}

export enum AdminMerchantFilter {
    ALL = 'ALL',
    SITE = 'SITE',
    BOT = 'BOT',
}

export enum AdminSortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export function trimOrUndefined(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim()
    return normalized || undefined
}

export function upperOrUndefined(value: unknown): string | undefined {
    return trimOrUndefined(value)?.toUpperCase()
}

export function booleanOrUndefined(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || String(value).toLowerCase() === 'true') return true
    if (value === false || String(value).toLowerCase() === 'false') return false
    return value as boolean
}

export function arrayValue(value: unknown): string[] | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const values = (Array.isArray(value) ? value : [value])
        .flatMap((item) => String(item).split(','))
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    return values.length ? values : undefined
}
