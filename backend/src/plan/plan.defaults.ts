export const PLAN_PERIOD_DAYS = [30, 90, 180, 360] as const
export const PLAN_DEVICE_LIMITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
export const LEGACY_PLAN_DEVICE_LIMITS: Record<string, number> = {
    vpn_1: 1,
    vpn_2: 2,
    vpn_3: 3,
}

export type PlanPeriodDays = (typeof PLAN_PERIOD_DAYS)[number]
export type PlanDeviceLimit = (typeof PLAN_DEVICE_LIMITS)[number]

export const PLAN_PRICING_MATRIX: Record<PlanDeviceLimit, Record<PlanPeriodDays, number>> = {
    1: { 30: 249, 90: 579, 180: 999, 360: 1749 },
    2: { 30: 299, 90: 699, 180: 1249, 360: 2099 },
    3: { 30: 349, 90: 829, 180: 1449, 360: 2499 },
    4: { 30: 399, 90: 949, 180: 1649, 360: 2849 },
    5: { 30: 449, 90: 1069, 180: 1849, 360: 3199 },
    6: { 30: 499, 90: 1189, 180: 2049, 360: 3549 },
    7: { 30: 549, 90: 1299, 180: 2249, 360: 3899 },
    8: { 30: 599, 90: 1429, 180: 2499, 360: 4299 },
    9: { 30: 649, 90: 1549, 180: 2699, 360: 4649 },
    10: { 30: 699, 90: 1669, 180: 2899, 360: 4999 },
}

export function pluralizeDevices(count: number) {
    const mod10 = count % 10
    const mod100 = count % 100

    if (mod10 === 1 && mod100 !== 11) {
        return 'устройство'
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return 'устройства'
    }

    return 'устройств'
}

export function buildPlanCode(period: number, devicesLimit: number) {
    return `vpn_${period}_${devicesLimit}`
}

export function daysToMonths(period: number) {
    if (period === 30) return 1
    if (period === 90) return 3
    if (period === 180) return 6
    if (period === 360) return 12
    return Math.max(1, Math.round(period / 30))
}

export function buildPeriodLabel(period: number) {
    const months = daysToMonths(period)
    if (months === 1) {
        return '1 месяц'
    }
    if (months >= 2 && months <= 4) {
        return `${months} месяца`
    }
    return `${months} месяцев`
}

export function buildPlanTitle(devicesLimit: number, period: number) {
    return `${devicesLimit} ${pluralizeDevices(devicesLimit)} · ${buildPeriodLabel(period)}`
}

export function buildPlanDescription(devicesLimit: number) {
    return `${devicesLimit} ${pluralizeDevices(devicesLimit)}`
}

export function resolveLegacyDevicesLimit(plan?: {
    code?: string | null
    devicesLimit?: number | null
    description?: string | null
    name?: string | null
    title?: string | null
}) {
    const directLimit = Number(plan?.devicesLimit || 0)
    if (directLimit > 0) {
        return directLimit
    }

    const byCode = LEGACY_PLAN_DEVICE_LIMITS[String(plan?.code || '').trim()]
    if (byCode) {
        return byCode
    }

    const rawText = [plan?.description, plan?.name, plan?.title].map((value) => String(value || '')).join(' ')
    const match = rawText.match(/(\d+)\s*устрой/i)
    return match ? Number(match[1]) : null
}

export function isLegacyNamedPlan(plan?: {
    code?: string | null
    title?: string | null
    name?: string | null
    devicesLimit?: number | null
}) {
    if (LEGACY_PLAN_DEVICE_LIMITS[String(plan?.code || '').trim()]) {
        return true
    }

    const normalized = `${String(plan?.title || '').trim()} ${String(plan?.name || '').trim()}`.toLowerCase()
    return ['light', 'comfort', 'premium', 'лайт', 'комфорт', 'премиум'].some((label) => normalized.includes(label))
}

export function buildSavingsPercent(amount: number, period: number, monthlyAmount: number | null | undefined) {
    const normalizedMonthly = Number(monthlyAmount || 0)
    const normalizedAmount = Number(amount || 0)
    const months = daysToMonths(period)

    if (normalizedMonthly <= 0 || normalizedAmount <= 0 || months <= 1) {
        return null
    }

    const baselineAmount = normalizedMonthly * months
    if (baselineAmount <= normalizedAmount) {
        return 0
    }

    return Math.max(0, Math.round(((baselineAmount - normalizedAmount) / baselineAmount) * 100))
}

export function buildDefaultVpnPlans() {
    return PLAN_DEVICE_LIMITS.flatMap((devicesLimit) =>
        PLAN_PERIOD_DAYS.map((period) => ({
            code: buildPlanCode(period, devicesLimit),
            title: buildPlanTitle(devicesLimit, period),
            name: buildPlanTitle(devicesLimit, period),
            description: buildPlanDescription(devicesLimit),
            amount: PLAN_PRICING_MATRIX[devicesLimit][period],
            period,
            isActive: true,
            devicesLimit,
        })),
    )
}

export const DEFAULT_VPN_PLANS = buildDefaultVpnPlans()
