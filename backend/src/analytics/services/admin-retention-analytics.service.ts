import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'

import { AdminRetentionSegment, AdminRetentionSortBy, AdminRetentionUsersQueryDto } from '../dto/admin-retention-query.dto'

const TIMEZONE = 'Europe/Moscow'
const MONEY = "'FM999999999999990.00'"

class Parameters {
    values: unknown[] = []
    add(value: unknown) { this.values.push(value); return `$${this.values.length}` }
}

@Injectable()
export class AdminRetentionAnalyticsService {
    constructor(private readonly dataSource: DataSource) {}

    async getOverview(asOf = new Date()) {
        const base = this.base(asOf)
        const rows = await this.dataSource.query(`${base.sql}
            SELECT COUNT(*)::text AS "customerUsers",
                COUNT(*) FILTER (WHERE cash_payment_count >= 1 AND currently_paid_entitled)::text AS "currentPaidUsers",
                COUNT(*) FILTER (WHERE cash_payment_count >= 2 AND currently_paid_entitled)::text AS "activeRepeatPayers",
                COUNT(*) FILTER (WHERE cash_payment_count >= 2)::text AS "repeatPayersEver",
                COUNT(*) FILTER (WHERE cash_payment_count = 1 AND NOT currently_paid_entitled)::text AS "onePaymentNoPaidEntitlement",
                COUNT(*) FILTER (WHERE has_used_trial AND cash_payment_count = 0 AND NOT currently_entitled)::text AS "trialOnlyNoEntitlement",
                COUNT(*) FILTER (WHERE has_used_trial)::text AS "trialUsers",
                COUNT(*) FILTER (WHERE has_used_trial AND cash_payment_count >= 1)::text AS "trialConvertedUsers",
                COUNT(*) FILTER (WHERE cash_payment_count >= 1)::text AS "payingUsersEver"
            FROM retention_base`, base.params)
        const row = rows[0] || {}
        const number = (value: unknown) => Number.parseInt(String(value || '0'), 10) || 0
        const trialUsers = number(row.trialUsers)
        const payingUsersEver = number(row.payingUsersEver)
        const trialConvertedUsers = number(row.trialConvertedUsers)
        const repeatPayersEver = number(row.repeatPayersEver)
        return {
            asOf: asOf.toISOString(), timezone: TIMEZONE, scope: 'LIFETIME_CURRENT_SNAPSHOT',
            customerUsers: number(row.customerUsers), currentPaidUsers: number(row.currentPaidUsers),
            activeRepeatPayers: number(row.activeRepeatPayers), repeatPayersEver,
            onePaymentNoPaidEntitlement: number(row.onePaymentNoPaidEntitlement),
            trialOnlyNoEntitlement: number(row.trialOnlyNoEntitlement), trialUsers, trialConvertedUsers, payingUsersEver,
            trialConversionRate: this.rate(trialConvertedUsers, trialUsers),
            repeatPurchaseRate: this.rate(repeatPayersEver, payingUsersEver),
        }
    }

    async listUsers(dto: AdminRetentionUsersQueryDto, asOf = new Date()) {
        const base = this.base(asOf, dto.search)
        const segment = this.segmentPredicate(dto.segment)
        const countRows = await this.dataSource.query(`${base.sql} SELECT COUNT(*)::text AS total FROM retention_base WHERE ${segment}`, base.params)
        const total = Number.parseInt(String(countRows[0]?.total || '0'), 10) || 0
        const sortMap: Record<AdminRetentionSortBy, string> = {
            [AdminRetentionSortBy.REGISTERED_AT]: 'registered_at', [AdminRetentionSortBy.FIRST_PAID_AT]: 'first_cash_paid_at',
            [AdminRetentionSortBy.LAST_PAID_AT]: 'last_cash_paid_at', [AdminRetentionSortBy.CASH_PAYMENTS]: 'cash_payment_count',
            [AdminRetentionSortBy.SUBSCRIPTION_ENDS_AT]: 'subscription_ends_at',
        }
        const direction = dto.sortDir === 'ASC' ? 'ASC' : 'DESC'
        const limit = base.parameters.add(dto.pageSize || 25)
        const offset = base.parameters.add(((dto.page || 1) - 1) * (dto.pageSize || 25))
        const rows = await this.dataSource.query(`${base.sql}
            SELECT * FROM retention_base WHERE ${segment}
            ORDER BY ${sortMap[dto.sortBy || AdminRetentionSortBy.REGISTERED_AT]} ${direction} NULLS LAST, user_id ${direction}
            LIMIT ${limit} OFFSET ${offset}`, base.parameters.values)
        return {
            asOf: asOf.toISOString(), timezone: TIMEZONE, segment: dto.segment,
            items: rows.map((row: any) => this.mapUser(row)), total, page: dto.page || 1, pageSize: dto.pageSize || 25,
            totalPages: Math.max(1, Math.ceil(total / (dto.pageSize || 25))),
        }
    }

    async getCohorts(months: number, asOf = new Date()) {
        const safeMonths = [6, 12, 24].includes(months) ? months : 12
        const base = this.base(asOf)
        const month = base.parameters.add(safeMonths)
        const rows = await this.dataSource.query(`${base.sql}, cohort_months AS (
                SELECT generate_series(
                    date_trunc('month', (${base.parameters.add(asOf)}::timestamptz AT TIME ZONE '${TIMEZONE}') - (${month}::int - 1) * interval '1 month'),
                    date_trunc('month', ${base.parameters.add(asOf)}::timestamptz AT TIME ZONE '${TIMEZONE}'), interval '1 month')::date AS month
            ), cohort_data AS (
                SELECT date_trunc('month', registered_at AT TIME ZONE '${TIMEZONE}')::date AS month,
                    COUNT(*) AS registered_users, COUNT(*) FILTER (WHERE has_used_trial) AS trial_users,
                    COUNT(*) FILTER (WHERE cash_payment_count >= 1) AS paying_users_ever,
                    COUNT(*) FILTER (WHERE cash_payment_count >= 2) AS repeat_payers_ever,
                    COUNT(*) FILTER (WHERE cash_payment_count >= 1 AND currently_paid_entitled) AS active_paid_users,
                    COUNT(*) FILTER (WHERE cash_payment_count = 1 AND NOT currently_paid_entitled) AS one_payment_no_paid_entitlement,
                    COUNT(*) FILTER (WHERE has_used_trial AND cash_payment_count = 0 AND NOT currently_entitled) AS trial_only_no_entitlement,
                    COUNT(*) FILTER (WHERE has_used_trial AND cash_payment_count >= 1) AS trial_converted_users
                FROM retention_base GROUP BY 1
            ) SELECT to_char(m.month, 'YYYY-MM') AS month,
                COALESCE(d.registered_users, 0)::text AS "registeredUsers", COALESCE(d.trial_users, 0)::text AS "trialUsers",
                COALESCE(d.paying_users_ever, 0)::text AS "payingUsersEver", COALESCE(d.repeat_payers_ever, 0)::text AS "repeatPayersEver",
                COALESCE(d.active_paid_users, 0)::text AS "activePaidUsers", COALESCE(d.one_payment_no_paid_entitlement, 0)::text AS "onePaymentNoPaidEntitlement",
                COALESCE(d.trial_only_no_entitlement, 0)::text AS "trialOnlyNoEntitlement", COALESCE(d.trial_converted_users, 0)::text AS "trialConvertedUsers"
            FROM cohort_months m LEFT JOIN cohort_data d USING (month) ORDER BY m.month`, base.parameters.values)
        return { asOf: asOf.toISOString(), timezone: TIMEZONE, cohortType: 'REGISTRATION_MONTH', outcomeMode: 'LIFETIME_TO_AS_OF', months: safeMonths,
            items: rows.map((row: any) => this.mapCohort(row)) }
    }

    private base(asOf: Date, search?: string) {
        const parameters = new Parameters()
        const at = parameters.add(asOf)
        const where = ["u.deleted_at IS NULL", "u.role::text = 'USER'"]
        if (search) { const value = parameters.add(`%${search.toLowerCase()}%`); where.push(`(LOWER(u.email) LIKE ${value} OR LOWER(u.telegram_username) LIKE ${value})`) }
        const sql = `WITH cash_payments AS (
            SELECT p.user_id, COUNT(*)::int AS cash_payment_count, MIN(p.paid_at) AS first_cash_paid_at,
                MAX(p.paid_at) AS last_cash_paid_at, COUNT(*) FILTER (WHERE p.is_recurring)::int AS recurring_cash_payment_count
            FROM payments p WHERE p.status = 'SUCCEEDED' AND p.amount::numeric > 0
                AND COALESCE(p.kind::text, 'EXTERNAL') = 'EXTERNAL' AND p.deleted_at IS NULL GROUP BY p.user_id
        ), retention_base AS (
            SELECT u.id AS user_id, u.email, u.telegram_username, u.telegram_first_name, u.telegram_last_name,
                u.created_at AS registered_at, u.has_used_trial, u.trial_used_at,
                COALESCE(cp.cash_payment_count, 0) AS cash_payment_count, cp.first_cash_paid_at, cp.last_cash_paid_at,
                COALESCE(cp.recurring_cash_payment_count, 0) AS recurring_cash_payment_count,
                s.status::text AS subscription_status, s.ends_at AS subscription_ends_at, s.grace_ends_at,
                s.is_trial, s.plan_id, pl.code AS plan_code, COALESCE(pl.title, pl.name) AS plan_title, u.is_blocked,
                COALESCE((s.status::text = 'ACTIVE' AND s.ends_at > ${at}) OR (s.status::text = 'GRACE' AND s.grace_ends_at > ${at}), false) AS currently_entitled,
                (COALESCE((s.status::text = 'ACTIVE' AND s.ends_at > ${at}) OR (s.status::text = 'GRACE' AND s.grace_ends_at > ${at}), false) AND NOT COALESCE(s.is_trial, false)) AS currently_paid_entitled
            FROM users u LEFT JOIN cash_payments cp ON cp.user_id = u.id
            LEFT JOIN subscriptions s ON s.user_id = u.id AND s.deleted_at IS NULL
            LEFT JOIN plans pl ON pl.id = s.plan_id AND pl.deleted_at IS NULL WHERE ${where.join(' AND ')}
        )`
        return { sql, params: parameters.values, parameters }
    }

    private segmentPredicate(segment: AdminRetentionSegment) {
        const predicates: Record<AdminRetentionSegment, string> = {
            [AdminRetentionSegment.ACTIVE_PAID]: 'cash_payment_count >= 1 AND currently_paid_entitled',
            [AdminRetentionSegment.ACTIVE_REPEAT]: 'cash_payment_count >= 2 AND currently_paid_entitled',
            [AdminRetentionSegment.REPEAT_EVER]: 'cash_payment_count >= 2',
            [AdminRetentionSegment.ONE_PAYMENT_NO_PAID_ENTITLEMENT]: 'cash_payment_count = 1 AND NOT currently_paid_entitled',
            [AdminRetentionSegment.TRIAL_ONLY_NO_ENTITLEMENT]: 'has_used_trial AND cash_payment_count = 0 AND NOT currently_entitled',
            [AdminRetentionSegment.TRIAL_TO_PAID]: 'has_used_trial AND cash_payment_count >= 1',
        }
        return predicates[segment]
    }

    private mapUser(row: any) {
        const name = [row.telegram_first_name, row.telegram_last_name].filter(Boolean).join(' ').trim()
        return { user: { id: row.user_id, label: row.telegram_username ? `@${row.telegram_username}` : row.email || name || `user #${String(row.user_id).slice(0, 8)}`, email: row.email || null, telegramUsername: row.telegram_username || null },
            registeredAt: this.iso(row.registered_at), hasUsedTrial: Boolean(row.has_used_trial), trialUsedAt: this.iso(row.trial_used_at), firstPaidAt: this.iso(row.first_cash_paid_at), lastPaidAt: this.iso(row.last_cash_paid_at),
            successfulCashPayments: Number(row.cash_payment_count), recurringCashPayments: Number(row.recurring_cash_payment_count), currentEntitlement: row.currently_paid_entitled ? 'PAID' : row.currently_entitled ? 'TRIAL' : 'NONE',
            subscriptionStatus: row.subscription_status || null, subscriptionEndsAt: this.iso(row.subscription_ends_at), graceEndsAt: this.iso(row.grace_ends_at),
            currentPlan: row.plan_id ? { id: row.plan_id, code: row.plan_code || null, title: row.plan_title || null } : null, isBlocked: Boolean(row.is_blocked) }
    }
    private mapCohort(row: any) { const n = (key: string) => Number.parseInt(String(row[key] || '0'), 10) || 0; const trialUsers=n('trialUsers'), paying=n('payingUsersEver'), converted=n('trialConvertedUsers'), repeat=n('repeatPayersEver'); return { month: row.month, registeredUsers:n('registeredUsers'), trialUsers, payingUsersEver:paying, repeatPayersEver:repeat, activePaidUsers:n('activePaidUsers'), onePaymentNoPaidEntitlement:n('onePaymentNoPaidEntitlement'), trialOnlyNoEntitlement:n('trialOnlyNoEntitlement'), trialConvertedUsers:converted, trialConversionRate:this.rate(converted,trialUsers), repeatPurchaseRate:this.rate(repeat,paying) } }
    private rate(numerator: number, denominator: number) { return denominator ? (numerator * 100 / denominator).toFixed(2) : '0.00' }
    private iso(value: unknown) { return value ? new Date(value as any).toISOString() : null }
}
