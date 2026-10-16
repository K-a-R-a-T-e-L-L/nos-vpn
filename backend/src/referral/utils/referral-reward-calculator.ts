export const REFERRAL_REWARD_PERCENT = 50
export const REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION = 'net-v3-actual-income'
export const REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION = 'net-v3-fallback-7_5'

type CalculationInput = {
    grossAmountRub: string | number
    providerIncomeAmountRub?: string | number | null
    paymentMethodType?: string | null
}

export type CalculatedReferralReward = {
    status: 'CALCULATED'
    grossAmountRub: string
    taxAmountRub: string
    providerIncomeAmountRub: string | null
    providerFeeAmountRub: string
    netReferralBaseRub: string
    rewardAmountRub: string
    rewardPercent: number
    paymentMethodType: string | null
    calculationVersion: string
}

export type PendingReferralRewardCalculation = {
    status: 'PENDING'
    grossAmountRub: string
    rewardPercent: number
    paymentMethodType: string | null
    calculationVersion: string
    errorCode: 'PROVIDER_INCOME_UNAVAILABLE'
}

export type ReferralRewardCalculation = CalculatedReferralReward | PendingReferralRewardCalculation

const ZERO = BigInt(0)
const TWO = BigInt(2)
const FOUR = BigInt(4)
const THIRTY_FIVE = BigInt(35)
const HUNDRED = BigInt(100)
const THOUSAND = BigInt(1000)

const roundRatio = (value: bigint, numerator: bigint, denominator: bigint) =>
    (value * numerator + denominator / TWO) / denominator

const parseRub = (value: string | number): bigint => {
    const text = String(value).trim()
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
        throw new Error('Invalid non-negative RUB amount')
    }
    const [whole, fraction = ''] = text.split('.')
    return BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, '0'))
}

const formatRub = (kopecks: bigint) => {
    const safe = kopecks < ZERO ? ZERO : kopecks
    return `${safe / HUNDRED}.${String(safe % HUNDRED).padStart(2, '0')}`
}

export function calculateNetReferralReward(input: CalculationInput): CalculatedReferralReward {
    const gross = parseRub(input.grossAmountRub)
    const paymentMethodType =
        String(input.paymentMethodType || '')
            .trim()
            .toLowerCase() || null
    const tax = roundRatio(gross, FOUR, HUNDRED)
    const hasProviderIncome = input.providerIncomeAmountRub !== null && input.providerIncomeAmountRub !== undefined

    let providerIncome: bigint | null = null
    let calculationVersion = REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION

    if (hasProviderIncome) {
        try {
            providerIncome = parseRub(input.providerIncomeAmountRub as string | number)
            if (providerIncome > gross) {
                providerIncome = null
            }
        } catch {
            providerIncome = null
        }
    }

    const providerFee = providerIncome === null ? roundRatio(gross, THIRTY_FIVE, THOUSAND) : gross - providerIncome
    const referralBase =
        providerIncome === null
            ? gross > tax + providerFee
                ? gross - tax - providerFee
                : ZERO
            : providerIncome > tax
              ? providerIncome - tax
              : ZERO
    if (providerIncome !== null) {
        calculationVersion = REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION
    }

    const reward = roundRatio(referralBase, BigInt(REFERRAL_REWARD_PERCENT), HUNDRED)
    return {
        status: 'CALCULATED',
        grossAmountRub: formatRub(gross),
        taxAmountRub: formatRub(tax),
        providerIncomeAmountRub: providerIncome === null ? null : formatRub(providerIncome),
        providerFeeAmountRub: formatRub(providerFee),
        netReferralBaseRub: formatRub(referralBase),
        rewardAmountRub: formatRub(reward),
        rewardPercent: REFERRAL_REWARD_PERCENT,
        paymentMethodType,
        calculationVersion,
    }
}
