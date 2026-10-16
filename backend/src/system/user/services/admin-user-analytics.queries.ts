import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Repository } from 'typeorm'

import { AdminSortDirection } from '../../../analytics/dto/admin-query.helpers'
import { parseMoscowBoundary } from '../../../analytics/utils/admin-analytics-period.util'
import {
    AdminUserAuthChannel,
    AdminUserPaymentState,
    AdminUserQueryDto,
    AdminUserReferralState,
    AdminUserSortBy,
    AdminUserSubscriptionState,
} from '../dto/admin-user-query.dto'
import { User } from '../entity/user.entity'

const count = (value: unknown) => Number.parseInt(String(value || '0'), 10) || 0
const iso = (value: unknown): string | null => (value ? new Date(value as any).toISOString() : null)

function mapUser(row: any) {
    const name = [row.telegramFirstName, row.telegramLastName].filter(Boolean).join(' ').trim()
    const label = row.telegramUsername ? `@${row.telegramUsername}` : row.email || name || `user #${String(row.id).slice(0, 8)}`
    const authChannels: string[] = []
    if (row.email) authChannels.push('EMAIL')
    if (row.telegramId !== null && row.telegramId !== undefined) authChannels.push('TELEGRAM')
    return {
        id: row.id, label, email: row.email || null, telegramUsername: row.telegramUsername || null, authChannels,
        createdAt: iso(row.createdAt), role: row.role, isBlocked: Boolean(row.isBlocked),
        subscription: {
            state: row.subscriptionState || 'NONE', status: row.subscriptionStatus || null, planId: row.planId || null,
            planTitle: row.planTitle || null, endsAt: iso(row.subscriptionEndsAt), autoRenewEnabled: Boolean(row.autoRenewEnabled),
        },
        successfulPaidTotal: row.successfulPaidTotal || '0.00', successfulPayments: count(row.successfulPayments),
        lastPaidAt: iso(row.lastPaidAt), referredUsersCount: count(row.referredUsersCount), wasReferred: Boolean(row.wasReferred),
    }
}

export async function queryAdminUsers(repository: Repository<User>, dto: AdminUserQueryDto) {
    const registeredFrom = dto.registeredFrom ? parseMoscowBoundary(dto.registeredFrom) : null
    const registeredTo = dto.registeredTo ? parseMoscowBoundary(dto.registeredTo) : null
    const expiresAfter = dto.expiresAfter ? parseMoscowBoundary(dto.expiresAfter) : null
    const expiresBefore = dto.expiresBefore ? parseMoscowBoundary(dto.expiresBefore) : null
    if (registeredFrom && registeredTo && registeredFrom >= registeredTo) {
        throw new BadRequestException('registeredFrom must be before registeredTo')
    }
    if (expiresAfter && expiresBefore && expiresAfter >= expiresBefore) {
        throw new BadRequestException('expiresAfter must be before expiresBefore')
    }
    const parameters: unknown[] = []
    const add = (value: unknown) => { parameters.push(value); return `$${parameters.length}` }
    const where = ['u.deleted_at IS NULL']
    if (dto.search) {
        const value = add(`%${dto.search.toLowerCase()}%`)
        where.push(`(LOWER(u.email) LIKE ${value} OR LOWER(u.telegram_username) LIKE ${value})`)
    }
    if (dto.userId) where.push(`u.id = ${add(dto.userId)}::uuid`)
    if (dto.telegramId) where.push(`u.telegram_id::text = ${add(dto.telegramId)}`)
    if (registeredFrom) where.push(`u.created_at >= ${add(registeredFrom)}`)
    if (registeredTo) where.push(`u.created_at < ${add(registeredTo)}`)
    if (dto.role) where.push(`u.role::text = ${add(dto.role)}`)
    if (dto.blocked !== undefined) where.push(`u.is_blocked = ${add(dto.blocked)}`)
    if (dto.authChannel === AdminUserAuthChannel.EMAIL) where.push('u.email IS NOT NULL AND u.telegram_id IS NULL')
    if (dto.authChannel === AdminUserAuthChannel.TELEGRAM) where.push('u.telegram_id IS NOT NULL AND u.email IS NULL')
    if (dto.authChannel === AdminUserAuthChannel.BOTH) where.push('u.telegram_id IS NOT NULL AND u.email IS NOT NULL')
    const active = `(s.id IS NOT NULL AND s.status::text IN ('ACTIVE', 'GRACE') AND s.ends_at > CURRENT_TIMESTAMP)`
    if (dto.subscriptionState === AdminUserSubscriptionState.NONE) where.push('s.id IS NULL')
    if (dto.subscriptionState === AdminUserSubscriptionState.ACTIVE) where.push(active)
    if (dto.subscriptionState === AdminUserSubscriptionState.EXPIRED) where.push(`s.id IS NOT NULL AND NOT ${active}`)
    if (dto.planId) where.push(`s.plan_id = ${add(dto.planId)}::uuid`)
    if (expiresBefore) where.push(`s.ends_at < ${add(expiresBefore)}`)
    if (expiresAfter) where.push(`s.ends_at >= ${add(expiresAfter)}`)
    if (dto.autoRenewEnabled !== undefined) where.push(`s.auto_renew_enabled = ${add(dto.autoRenewEnabled)}`)
    if (dto.paymentState === AdminUserPaymentState.EVER_PAID) where.push('COALESCE(pa.successful_payments, 0) > 0')
    if (dto.paymentState === AdminUserPaymentState.NEVER_PAID) where.push('COALESCE(pa.successful_payments, 0) = 0')
    if (dto.referralState === AdminUserReferralState.IS_REFERRER) where.push('COALESCE(ra.referred_users_count, 0) > 0')
    if (dto.referralState === AdminUserReferralState.WAS_REFERRED) where.push('u.referred_by_user_id IS NOT NULL')
    if (dto.promoCode) where.push(`EXISTS (SELECT 1 FROM promo_usage pu JOIN promo_code pc ON pc.id = pu.promo_code_id
        WHERE pu.user_id = u.id AND pu.deleted_at IS NULL AND UPPER(pc.code) = ${add(dto.promoCode)})`)

    const base = `WITH payment_agg AS (
            SELECT p.user_id, COUNT(*) AS successful_payments, SUM(p.amount::numeric) AS successful_paid_total, MAX(p.paid_at) AS last_paid_at
            FROM payments p WHERE p.status = 'SUCCEEDED' AND p.amount::numeric > 0
              AND COALESCE(p.kind::text, 'EXTERNAL') = 'EXTERNAL' AND p.deleted_at IS NULL GROUP BY p.user_id
        ), referral_agg AS (
            SELECT referred_by_user_id AS user_id, COUNT(*) AS referred_users_count FROM users
            WHERE referred_by_user_id IS NOT NULL AND deleted_at IS NULL GROUP BY referred_by_user_id
        ), admin_users AS (
            SELECT u.id, u.email, u.telegram_username AS "telegramUsername", u.telegram_first_name AS "telegramFirstName",
                u.telegram_last_name AS "telegramLastName", u.telegram_id AS "telegramId", u.created_at AS "createdAt",
                u.role::text AS role, u.is_blocked AS "isBlocked", u.referred_by_user_id AS "referredByUserId",
                s.id AS "subscriptionId", s.status::text AS "subscriptionStatus", s.ends_at AS "subscriptionEndsAt",
                s.auto_renew_enabled AS "autoRenewEnabled", s.plan_id AS "planId", COALESCE(pl.title, pl.name) AS "planTitle",
                CASE WHEN s.id IS NULL THEN 'NONE' WHEN ${active} THEN 'ACTIVE' ELSE 'EXPIRED' END AS "subscriptionState",
                COALESCE(pa.successful_paid_total, 0)::numeric AS "successfulPaidTotalNumeric",
                to_char(COALESCE(pa.successful_paid_total, 0), 'FM999999999999990.00') AS "successfulPaidTotal",
                COALESCE(pa.successful_payments, 0)::text AS "successfulPayments", pa.last_paid_at AS "lastPaidAt",
                COALESCE(ra.referred_users_count, 0)::text AS "referredUsersCount", (u.referred_by_user_id IS NOT NULL) AS "wasReferred"
            FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id AND s.deleted_at IS NULL
            LEFT JOIN plans pl ON pl.id = s.plan_id AND pl.deleted_at IS NULL
            LEFT JOIN payment_agg pa ON pa.user_id = u.id LEFT JOIN referral_agg ra ON ra.user_id = u.id
            WHERE ${where.join(' AND ')}
        )`
    const totalRows = await repository.query(`${base} SELECT COUNT(*)::text AS total FROM admin_users`, parameters)
    const total = count(totalRows[0]?.total)
    const sortMap: Record<AdminUserSortBy, string> = {
        [AdminUserSortBy.CREATED_AT]: 'a."createdAt"', [AdminUserSortBy.EMAIL]: 'a.email',
        [AdminUserSortBy.SUBSCRIPTION_ENDS_AT]: 'a."subscriptionEndsAt"',
        [AdminUserSortBy.SUCCESSFUL_PAID_TOTAL]: 'a."successfulPaidTotalNumeric"', [AdminUserSortBy.LAST_PAID_AT]: 'a."lastPaidAt"',
    }
    const direction = dto.sortDir === AdminSortDirection.ASC ? 'ASC' : 'DESC'
    const sort = sortMap[dto.sortBy || AdminUserSortBy.CREATED_AT]
    const limit = add(dto.pageSize || 25)
    const offset = add(((dto.page || 1) - 1) * (dto.pageSize || 25))
    const rows = await repository.query(`${base} SELECT * FROM admin_users a ORDER BY ${sort} ${direction} NULLS LAST, a.id ${direction} LIMIT ${limit} OFFSET ${offset}`, parameters)
    return { items: rows.map(mapUser), total, page: dto.page || 1, pageSize: dto.pageSize || 25, totalPages: Math.max(1, Math.ceil(total / (dto.pageSize || 25))) }
}

export async function getAdminUserDetails(repository: Repository<User>, userId: string, paymentPage = 1, paymentPageSize = 25) {
    const safePage = Math.max(1, paymentPage || 1)
    const safePageSize = Math.min(50, Math.max(10, paymentPageSize || 25))
    const profiles = await repository.query(`WITH payment_agg AS (
            SELECT COUNT(*) AS successful_payments, SUM(p.amount::numeric) AS successful_paid_total, MAX(p.paid_at) AS last_paid_at
            FROM payments p WHERE p.user_id = $1 AND p.status = 'SUCCEEDED' AND p.amount::numeric > 0
              AND COALESCE(p.kind::text, 'EXTERNAL') = 'EXTERNAL' AND p.deleted_at IS NULL
        ), referral_agg AS (SELECT COUNT(*) AS referred_users_count FROM users WHERE referred_by_user_id = $1 AND deleted_at IS NULL)
        SELECT u.id, u.email, u.telegram_username AS "telegramUsername", u.telegram_first_name AS "telegramFirstName",
            u.telegram_last_name AS "telegramLastName", u.telegram_id AS "telegramId", u.created_at AS "createdAt",
            u.role::text AS role, u.is_blocked AS "isBlocked", u.referred_by_user_id AS "referredByUserId",
            s.id AS "subscriptionId", s.status::text AS "subscriptionStatus", s.ends_at AS "subscriptionEndsAt",
            s.auto_renew_enabled AS "autoRenewEnabled", s.plan_id AS "planId", COALESCE(pl.title, pl.name) AS "planTitle",
            CASE WHEN s.id IS NULL THEN 'NONE' WHEN s.status::text IN ('ACTIVE','GRACE') AND s.ends_at > CURRENT_TIMESTAMP THEN 'ACTIVE' ELSE 'EXPIRED' END AS "subscriptionState",
            to_char(COALESCE(pa.successful_paid_total, 0), 'FM999999999999990.00') AS "successfulPaidTotal",
            COALESCE(pa.successful_payments, 0)::text AS "successfulPayments", pa.last_paid_at AS "lastPaidAt",
            COALESCE(ra.referred_users_count, 0)::text AS "referredUsersCount", (u.referred_by_user_id IS NOT NULL) AS "wasReferred"
        FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id AND s.deleted_at IS NULL LEFT JOIN plans pl ON pl.id = s.plan_id AND pl.deleted_at IS NULL
        CROSS JOIN payment_agg pa CROSS JOIN referral_agg ra WHERE u.id = $1::uuid AND u.deleted_at IS NULL`, [userId])
    if (!profiles[0]) throw new NotFoundException('User not found')

    const paymentType = `CASE WHEN p.kind::text = 'BONUS_BALANCE' THEN 'BONUS' WHEN p.kind::text = 'PROMO_DISCOUNT' THEN 'PROMO_DISCOUNT'
        WHEN p.is_recurring THEN 'RECURRENT' WHEN NOT EXISTS (SELECT 1 FROM payments e WHERE e.user_id = p.user_id AND e.status = 'SUCCEEDED'
        AND e.deleted_at IS NULL AND (e.paid_at < p.paid_at OR (e.paid_at = p.paid_at AND e.id < p.id))) THEN 'FIRST_PURCHASE' ELSE 'MANUAL_RENEWAL' END`
    const [paymentCountRows, payments, promos, referrals, support] = await Promise.all([
        repository.query(`SELECT COUNT(*)::text AS total FROM payments WHERE user_id = $1::uuid AND deleted_at IS NULL`, [userId]),
        repository.query(`SELECT p.id, p.created_at AS "createdAt", p.paid_at AS "paidAt", p.merchant::text AS merchant, p.provider,
            ${paymentType} AS "paymentType", p.plan_id AS "planId", pl.code AS "planCode", COALESCE(pl.title, pl.name) AS "planTitle",
            pc.code AS "promoCode", to_char(p.amount::numeric, 'FM999999999999990.00') AS amount, p.currency,
            p.status::text AS status, p.activation_status::text AS "activationStatus"
            FROM payments p LEFT JOIN plans pl ON pl.id = p.plan_id LEFT JOIN promo_code pc ON pc.id::text = p.metadata_snapshot ->> 'promo_id'
            WHERE p.user_id = $1::uuid AND p.deleted_at IS NULL ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`,
            [userId, safePageSize, (safePage - 1) * safePageSize]),
        repository.query(`SELECT pc.code AS "promoCode", pu.status::text AS status, pu.applied_at AS "appliedAt"
            FROM promo_usage pu JOIN promo_code pc ON pc.id = pu.promo_code_id WHERE pu.user_id = $1::uuid AND pu.deleted_at IS NULL
            ORDER BY pu.created_at DESC, pu.id DESC`, [userId]),
        repository.query(`SELECT ref.id AS "referrerId", ref.email AS "referrerEmail", ref.telegram_username AS "referrerUsername",
            ref.telegram_first_name AS "referrerFirstName", ref.telegram_last_name AS "referrerLastName",
            (SELECT COUNT(*) FROM users invited WHERE invited.referred_by_user_id = u.id AND invited.deleted_at IS NULL)::text AS "referredUsersCount",
            (SELECT COUNT(DISTINCT p.user_id) FROM users invited JOIN payments p ON p.user_id = invited.id AND p.status = 'SUCCEEDED' AND p.deleted_at IS NULL
                WHERE invited.referred_by_user_id = u.id AND invited.deleted_at IS NULL)::text AS "referredPayingUsers",
            to_char(COALESCE((SELECT SUM(l.bonus_rub::numeric) FROM referral_bonus_ledger l WHERE l.referrer_user_id = u.id AND l.status = 'AWARDED' AND l.deleted_at IS NULL), 0), 'FM999999999999990.00') AS "awardedBonusTotal",
            to_char(u.referral_bonus_balance_rub::numeric, 'FM999999999999990.00') AS "currentWalletBalance"
            FROM users u LEFT JOIN users ref ON ref.id = u.referred_by_user_id WHERE u.id = $1::uuid`, [userId]),
        repository.query(`SELECT st.status, st.last_message_at AS "lastMessageAt", st.last_user_message_at AS "lastUserMessageAt",
            st.last_admin_message_at AS "lastAdminMessageAt", COUNT(sm.id)::text AS "messagesCount"
            FROM support_thread st LEFT JOIN support_message sm ON sm.thread_id = st.id AND sm.deleted_at IS NULL
            WHERE st.user_id = $1::uuid AND st.deleted_at IS NULL GROUP BY st.id`, [userId]),
    ])
    const profile = mapUser(profiles[0])
    const referral = referrals[0]
    const referrerName = [referral?.referrerFirstName, referral?.referrerLastName].filter(Boolean).join(' ').trim()
    return {
        profile,
        paymentHistory: payments.map((row: any) => ({
            id: row.id, shortId: String(row.id).slice(0, 8), createdAt: iso(row.createdAt), paidAt: iso(row.paidAt),
            user: { id: profile.id, label: profile.label, email: profile.email, telegramUsername: profile.telegramUsername },
            merchant: row.merchant || null, provider: row.provider, paymentType: row.paymentType,
            plan: { id: row.planId || null, code: row.planCode || null, title: row.planTitle || null }, promoCode: row.promoCode || null,
            amount: row.amount || '0.00', currency: row.currency, status: row.status, activationStatus: row.activationStatus || null,
        })),
        paymentTotal: count(paymentCountRows[0]?.total), paymentPage: safePage, paymentPageSize: safePageSize,
        promoUsages: promos.map((row: any) => ({ promoCode: row.promoCode, status: row.status, appliedAt: iso(row.appliedAt) })),
        referral: {
            referrer: referral?.referrerId ? { id: referral.referrerId, label: referral.referrerUsername ? `@${referral.referrerUsername}` : referral.referrerEmail || referrerName || `user #${String(referral.referrerId).slice(0, 8)}`,
                email: referral.referrerEmail || null, telegramUsername: referral.referrerUsername || null } : null,
            referredUsersCount: count(referral?.referredUsersCount), referredPayingUsers: count(referral?.referredPayingUsers),
            awardedBonusTotal: referral?.awardedBonusTotal || '0.00', currentWalletBalance: referral?.currentWalletBalance || '0.00',
        },
        supportSummary: support[0] ? { status: support[0].status, messagesCount: count(support[0].messagesCount), lastMessageAt: iso(support[0].lastMessageAt),
            lastUserMessageAt: iso(support[0].lastUserMessageAt), lastAdminMessageAt: iso(support[0].lastAdminMessageAt) }
            : { status: null, messagesCount: 0, lastMessageAt: null, lastUserMessageAt: null, lastAdminMessageAt: null },
    }
}
