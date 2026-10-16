import { Injectable } from '@nestjs/common'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { resolveLegacyDevicesLimit } from '../plan/plan.defaults'
import { Subscription } from '../subscription/entity/subscription.entity'
import { User } from '../system/user/entity/user.entity'

@Injectable()
export class SubscriptionPolicyService {
    assertTrialAllowed(
        user: User,
        plan: {
            code?: string | null
            period?: number | null
            devicesLimit?: number | null
            description?: string | null
            name?: string | null
            title?: string | null
        },
        hasPromoCode: boolean,
    ) {
        const devicesLimit = resolveLegacyDevicesLimit(plan)
        const isTrialPlan = Number(plan?.period || 0) === 30 && devicesLimit === 1

        if (!isTrialPlan) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Trial is available only for the 30-day 1-device plan')
        }

        if (user.hasUsedTrial) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Trial already used')
        }

        if (hasPromoCode) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Trial cannot be combined with promo code')
        }
    }

    assertPromoApplicable(user: User, promoCode: string) {
        if (!promoCode) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Promo code is required')
        }
    }

    assertManualRenewAllowed(subscription: Subscription) {
        if (!subscription) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
        }
        if (subscription.plan?.period && subscription.plan.period !== 30) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Only 30-day manual renewals are supported')
        }
    }

    computePaidPeriod(periodDays: number, now: Date) {
        const startsAt = new Date(now)
        const endsAt = new Date(now)
        endsAt.setDate(endsAt.getDate() + periodDays)
        const nextPayAt = new Date(endsAt)
        return { startsAt, endsAt, nextPayAt }
    }

    computeTrialPeriod(now: Date) {
        const startsAt = new Date(now)
        const endsAt = new Date(now)
        endsAt.setDate(endsAt.getDate() + 3)
        return { startsAt, endsAt }
    }

    computeGracePeriod(endsAt: Date) {
        const graceEndsAt = new Date(endsAt)
        graceEndsAt.setHours(graceEndsAt.getHours() + 24)
        return { graceEndsAt }
    }

    assertReferralAttributionAllowed(user: User, referrer: User) {
        if (user.id === referrer.id) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Self-referral is forbidden')
        }

        if (user.referredByUserId && user.referredByUserId !== referrer.id) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Referrer is already attached')
        }
    }
}
