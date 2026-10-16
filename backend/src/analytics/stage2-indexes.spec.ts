import { getMetadataArgsStorage } from 'typeorm'

import { Payment } from '../payment/entity/payment.entity'
import { PromoUsage } from '../promo/entity/promo-usage.entity'
import { ReferralBonusLedger } from '../referral/entity/referral-bonus-ledger.entity'
import { Subscription } from '../subscription/entity/subscription.entity'
import { User } from '../system/user/entity/user.entity'

describe('Stage 2 TypeORM metadata indexes', () => {
    it.each([
        [Payment, ['IDX_payments_status_paid_id', 'IDX_payments_status_merchant_provider_paid', 'IDX_payments_user_status_paid', 'IDX_payments_plan_status_paid', 'IDX_payments_created_status']],
        [ReferralBonusLedger, ['IDX_referral_bonus_referrer_status_awarded', 'IDX_referral_bonus_referred_status']],
        [PromoUsage, ['IDX_promo_usage_code_status_applied', 'IDX_promo_usage_user_status']],
        [Subscription, ['IDX_subscriptions_status_ends', 'IDX_subscriptions_plan_status_ends', 'IDX_subscriptions_auto_renew_next_payment']],
        [User, ['IDX_users_created_id', 'IDX_users_role_created', 'IDX_users_blocked_created', 'IDX_users_referred_created']],
    ])('%p declares the required non-migration indexes', (entity, expected) => {
        const names = getMetadataArgsStorage().indices.filter((index) => index.target === entity).map((index) => index.name)
        expect(names).toEqual(expect.arrayContaining(expected))
        const requiredNames = names.filter((name) => expected.includes(name as string))
        expect(new Set(requiredNames).size).toBe(expected.length)
    })
})
