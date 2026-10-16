import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
    REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION,
    REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION,
    REFERRAL_REWARD_PERCENT,
    calculateNetReferralReward,
} from './referral-reward-calculator'

describe('calculateNetReferralReward', () => {
    it.each([
        ['bank_card', '965.00', '35.00', '925.00', '462.50'],
        ['sbp', '997.00', '3.00', '957.00', '478.50'],
        ['cash_like_future_method', '990.00', '10.00', '950.00', '475.00'],
    ])(
        'uses actual provider income for %s',
        (paymentMethodType, providerIncomeAmountRub, providerFeeAmountRub, netReferralBaseRub, rewardAmountRub) => {
            expect(
                calculateNetReferralReward({
                    grossAmountRub: '1000.00',
                    providerIncomeAmountRub,
                    paymentMethodType,
                }),
            ).toEqual({
                status: 'CALCULATED',
                grossAmountRub: '1000.00',
                taxAmountRub: '40.00',
                providerIncomeAmountRub,
                providerFeeAmountRub,
                netReferralBaseRub,
                rewardAmountRub,
                rewardPercent: REFERRAL_REWARD_PERCENT,
                paymentMethodType,
                calculationVersion: REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION,
            })
        },
    )

    it.each(['bank_card', 'sbp', 'cash_like_future_method'])(
        'uses the same fixed fallback expenses for %s when provider income is missing',
        (paymentMethodType) => {
            expect(
                calculateNetReferralReward({
                    grossAmountRub: '1000.00',
                    paymentMethodType,
                }),
            ).toEqual({
                status: 'CALCULATED',
                grossAmountRub: '1000.00',
                taxAmountRub: '40.00',
                providerIncomeAmountRub: null,
                providerFeeAmountRub: '35.00',
                netReferralBaseRub: '925.00',
                rewardAmountRub: '462.50',
                rewardPercent: REFERRAL_REWARD_PERCENT,
                paymentMethodType,
                calculationVersion: REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION,
            })
        },
    )

    it.each([
        ['malformed', 'secret-invalid-value'],
        ['greater than gross', '1000.01'],
    ])('uses the fixed fallback when provider income is %s', (_label, providerIncomeAmountRub) => {
        const result = calculateNetReferralReward({
            grossAmountRub: '1000.00',
            providerIncomeAmountRub,
            paymentMethodType: 'sbp',
        })

        expect(result).toMatchObject({
            status: 'CALCULATED',
            providerIncomeAmountRub: null,
            providerFeeAmountRub: '35.00',
            netReferralBaseRub: '925.00',
            rewardAmountRub: '462.50',
            calculationVersion: REFERRAL_REWARD_FALLBACK_CALCULATION_VERSION,
        })
        expect(JSON.stringify(result)).not.toContain(String(providerIncomeAmountRub))
    })

    it('derives different fee, base and reward values from different valid actual income for the same gross', () => {
        const higherIncome = calculateNetReferralReward({
            grossAmountRub: '1000.00',
            providerIncomeAmountRub: '990.00',
            paymentMethodType: 'bank_card',
        })
        const lowerIncome = calculateNetReferralReward({
            grossAmountRub: '1000.00',
            providerIncomeAmountRub: '900.00',
            paymentMethodType: 'bank_card',
        })

        expect(higherIncome).toMatchObject({
            providerFeeAmountRub: '10.00',
            netReferralBaseRub: '950.00',
            rewardAmountRub: '475.00',
        })
        expect(lowerIncome).toMatchObject({
            providerFeeAmountRub: '100.00',
            netReferralBaseRub: '860.00',
            rewardAmountRub: '430.00',
        })
    })

    it('contains no former VAT-adjusted fallback or method-specific fallback branch', () => {
        const source = readFileSync(join(__dirname, 'referral-reward-calculator.ts'), 'utf8')
        const forbiddenBasisPoints = ['4', '27'].join('')
        const forbiddenTaxLabel = ['V', 'A', 'T'].join('')

        expect(source).not.toContain(`BigInt(${forbiddenBasisPoints})`)
        expect(source.toUpperCase()).not.toContain(forbiddenTaxLabel)
        expect(source).not.toMatch(/paymentMethodType\s*===\s*['"]bank_card['"]/)
    })

    it.each([
        ['0.01', '0.01', '0.00', '0.01', '0.01'],
        ['0.00', '0.00', '0.00', '0.00', '0.00'],
        ['10.00', '0.00', '10.00', '0.00', '0.00'],
    ])(
        'rounds actual-income case %s deterministically and never creates a negative base',
        (grossAmountRub, providerIncomeAmountRub, providerFeeAmountRub, netReferralBaseRub, rewardAmountRub) => {
            expect(
                calculateNetReferralReward({
                    grossAmountRub,
                    providerIncomeAmountRub,
                    paymentMethodType: 'sbp',
                }),
            ).toMatchObject({
                status: 'CALCULATED',
                providerFeeAmountRub,
                netReferralBaseRub,
                rewardAmountRub,
                calculationVersion: REFERRAL_REWARD_ACTUAL_CALCULATION_VERSION,
            })
        },
    )
})
