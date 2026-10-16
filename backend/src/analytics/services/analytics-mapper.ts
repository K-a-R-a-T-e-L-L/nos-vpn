export function normalizeAnalyticsSourceCode(code: string) {
    return String(code || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

export function normalizeOptionalAnalyticsSourceCode(code?: string | null) {
    const normalized = normalizeAnalyticsSourceCode(code || '')
    return normalized || null
}

export function extractAnalyticsSourceCodeFromStartPayload(payload?: string | null) {
    const rawPayload = String(payload || '').trim()
    if (!rawPayload.startsWith('src_')) {
        return null
    }
    return normalizeOptionalAnalyticsSourceCode(rawPayload.slice(4))
}

export function roundAnalyticsMoney(value: number) {
    return Math.round((Number(value) || 0) * 100) / 100
}
