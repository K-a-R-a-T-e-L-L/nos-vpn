import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { AdminAnalyticsFilterDto } from './admin-analytics-filter.dto'
import { AdminPaymentQueryDto } from './admin-payment-query.dto'
import { AdminReferralQueryDto } from './admin-referral-query.dto'
import { AdminReferrerInvitesQueryDto } from './admin-referrer-invites-query.dto'
import { AdminReferrerQueryDto } from './admin-referrer-query.dto'
import { AdminUserQueryDto } from '../../system/user/dto/admin-user-query.dto'

describe('Stage 2 admin query DTOs', () => {
    const transform = <T>(type: new () => T, value: object) =>
        plainToInstance(type, value, { enableImplicitConversion: true })

    it('normalizes booleans, promo and safe search without false becoming true', async () => {
        const analytics = transform(AdminAnalyticsFilterDto, {
            referred: 'false',
            promoCode: ' save20 ',
            userSearch: ' user ',
        })
        expect(analytics).toMatchObject({ referred: false, promoCode: 'SAVE20', userSearch: 'user' })
        expect(await validate(analytics as any)).toHaveLength(0)

        const users = transform(AdminUserQueryDto, { blocked: 'false', autoRenewEnabled: 'true' })
        expect(users).toMatchObject({ blocked: false, autoRenewEnabled: true })
        expect(await validate(users as any)).toHaveLength(0)
    })

    it('normalizes status/ledger arrays and validates pagination limits', async () => {
        const payments = transform(AdminPaymentQueryDto, { statuses: 'SUCCEEDED,failed', pageSize: '101' })
        expect(payments.statuses).toEqual(['SUCCEEDED', 'FAILED'])
        expect(await validate(payments as any)).not.toHaveLength(0)

        const referrals = transform(AdminReferralQueryDto, { ledgerStatus: ['awarded', 'rejected'], pageSize: '25' })
        expect(referrals.ledgerStatus).toEqual(['AWARDED', 'REJECTED'])
        expect(await validate(referrals as any)).toHaveLength(0)
    })

    it('rejects invalid UUID, enum and exact Telegram-id shape violations', async () => {
        const users = transform(AdminUserQueryDto, { userId: 'partial-id', telegramId: '', authChannel: 'TEST_LAB' })
        expect(await validate(users as any)).not.toHaveLength(0)
        expect(Object.keys(users as any)).not.toContain('testLab')
    })

    it('rejects unknown query fields with the strict endpoint pipe', async () => {
        const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
        await expect(
            pipe.transform({ unknownField: 'x' }, { type: 'query', metatype: AdminAnalyticsFilterDto } as any),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('preserves referrer false filters and applies server pagination defaults', async () => {
        const referrers = transform(AdminReferrerQueryDto, {
            onlyWithInvited: 'false',
            onlyWithPayingInvited: 'true',
            metricScope: 'PERIOD',
            page: '2',
            pageSize: '100',
        })
        expect(referrers).toMatchObject({
            onlyWithInvited: false,
            onlyWithPayingInvited: true,
            metricScope: 'PERIOD',
            page: 2,
            pageSize: 100,
        })
        expect(await validate(referrers as any)).toHaveLength(0)

        const invites = transform(AdminReferrerInvitesQueryDto, { paidState: 'EVER_PAID', pageSize: '101' })
        expect(await validate(invites as any)).not.toHaveLength(0)
    })
})
