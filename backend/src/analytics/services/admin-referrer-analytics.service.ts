import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'

import { AdminFinanceAnalyticsService } from './admin-finance-analytics.service'
import { PaymentKind } from '../../payment/enum/payment-kind.enum'
import { AdminSortDirection } from '../dto/admin-query.helpers'
import {
    AdminReferrerInvitePaidState,
    AdminReferrerInviteSortBy,
    AdminReferrerInvitesQueryDto,
} from '../dto/admin-referrer-invites-query.dto'
import { AdminReferrerMetricScope, AdminReferrerQueryDto, AdminReferrerSortBy } from '../dto/admin-referrer-query.dto'

const MONEY_SQL = "'FM999999999999990.00'"

class SqlParameters {
    readonly values: unknown[] = []

    add(value: unknown): string {
        this.values.push(value)
        return `$${this.values.length}`
    }
}

@Injectable()
export class AdminReferrerAnalyticsService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly financeAnalytics: AdminFinanceAnalyticsService,
    ) {}

    async listReferrers(dto: AdminReferrerQueryDto) {
        const period = this.financeAnalytics.resolvePeriod(dto)
        const query = this.referrerBase(dto, period)
        const filters = this.referrerFilters(dto, query.parameterBuilder)
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
        const countRows = await this.dataSource.query(
            `${query.sql} SELECT COUNT(*)::text AS total FROM referrer_metrics ${where}`,
            [...query.parameterBuilder.values],
        )
        const total = this.count(countRows[0]?.total)
        const scope = dto.metricScope || AdminReferrerMetricScope.LIFETIME
        const lifetimeSort: Record<AdminReferrerSortBy, string> = {
            [AdminReferrerSortBy.INVITED_USERS]: 'invited_users',
            [AdminReferrerSortBy.PAYING_INVITED_USERS]: 'paying_invited_users',
            [AdminReferrerSortBy.REFERRED_GROSS_REVENUE]: 'referred_gross_revenue',
            [AdminReferrerSortBy.LIFETIME_AWARDED_BONUS]: 'lifetime_awarded_bonus',
            [AdminReferrerSortBy.CURRENT_WALLET_BALANCE]: 'current_wallet_balance',
            [AdminReferrerSortBy.LAST_REFERRAL_AT]: 'last_referral_at',
        }
        const periodSort: Partial<Record<AdminReferrerSortBy, string>> = {
            [AdminReferrerSortBy.INVITED_USERS]: 'period_invited_users',
            [AdminReferrerSortBy.PAYING_INVITED_USERS]: 'period_paying_invited_users',
            [AdminReferrerSortBy.REFERRED_GROSS_REVENUE]: 'period_gross_revenue',
            [AdminReferrerSortBy.LAST_REFERRAL_AT]: 'period_last_referral_at',
        }
        const sortBy = dto.sortBy || AdminReferrerSortBy.INVITED_USERS
        const sort =
            scope === AdminReferrerMetricScope.PERIOD
                ? periodSort[sortBy] || lifetimeSort[sortBy]
                : lifetimeSort[sortBy]
        const direction = dto.sortDir === AdminSortDirection.ASC ? 'ASC' : 'DESC'
        const nulls = sort.endsWith('_at') ? ' NULLS LAST' : ''
        const limit = query.parameterBuilder.add(dto.pageSize || 25)
        const offset = query.parameterBuilder.add(((dto.page || 1) - 1) * (dto.pageSize || 25))
        const rows = await this.dataSource.query(
            `${query.sql}
            SELECT referrer_id, referrer_email, referrer_username, referrer_first_name, referrer_last_name,
                invited_users::text, paying_invited_users::text,
                to_char(CASE WHEN invited_users = 0 THEN 0 ELSE paying_invited_users::numeric * 100 / invited_users END, ${MONEY_SQL}) AS referral_conversion_percent,
                referred_successful_payments::text, to_char(referred_gross_revenue, ${MONEY_SQL}) AS referred_gross_revenue,
                to_char(lifetime_awarded_bonus, ${MONEY_SQL}) AS lifetime_awarded_bonus,
                to_char(current_wallet_balance, ${MONEY_SQL}) AS current_wallet_balance,
                first_referral_at, last_referral_at, last_awarded_at,
                period_invited_users::text, period_paying_invited_users::text,
                period_successful_payments::text, to_char(period_gross_revenue, ${MONEY_SQL}) AS period_gross_revenue,
                to_char(period_awarded_bonus, ${MONEY_SQL}) AS period_awarded_bonus
            FROM referrer_metrics ${where}
            ORDER BY ${sort} ${direction}${nulls}, referrer_id ${direction}
            LIMIT ${limit} OFFSET ${offset}`,
            query.parameterBuilder.values,
        )

        return {
            period: this.periodResponse(period),
            items: rows.map((row: any) => this.mapReferrer(row)),
            total,
            page: dto.page || 1,
            pageSize: dto.pageSize || 25,
            totalPages: Math.max(1, Math.ceil(total / (dto.pageSize || 25))),
        }
    }

    async getReferrerInvites(userId: string, dto: AdminReferrerInvitesQueryDto, now = new Date()) {
        const period = this.financeAnalytics.resolvePeriod(dto)
        const query = this.invitesBase(userId, dto, period)
        const summaryRows = await this.dataSource.query(
            `SELECT referrer.id AS referrer_id,
                referrer.email AS referrer_email, referrer.telegram_username AS referrer_username,
                referrer.telegram_first_name AS referrer_first_name, referrer.telegram_last_name AS referrer_last_name,
                to_char(referrer.total_referral_bonus_rub::numeric, ${MONEY_SQL}) AS lifetime_awarded_bonus,
                to_char(referrer.referral_bonus_balance_rub::numeric, ${MONEY_SQL}) AS current_wallet_balance
            FROM users referrer
            WHERE referrer.id = $1::uuid AND referrer.deleted_at IS NULL`,
            [userId],
        )
        if (!summaryRows.length) throw new NotFoundException('Referrer not found')

        const earningsRows = await this.dataSource.query(
            `WITH month_bounds AS (
                SELECT
                    date_trunc('month', $2::timestamptz AT TIME ZONE 'Europe/Moscow')
                        AT TIME ZONE 'Europe/Moscow' AS current_month_from,
                    (date_trunc('month', $2::timestamptz AT TIME ZONE 'Europe/Moscow') + interval '1 month')
                        AT TIME ZONE 'Europe/Moscow' AS current_month_to,
                    (date_trunc('month', $2::timestamptz AT TIME ZONE 'Europe/Moscow') - interval '1 month')
                        AT TIME ZONE 'Europe/Moscow' AS previous_month_from
            )
            SELECT
                to_char(COALESCE(SUM(ledger.bonus_rub::numeric) FILTER (
                    WHERE ledger.awarded_at >= bounds.current_month_from
                        AND ledger.awarded_at < bounds.current_month_to
                ), 0), ${MONEY_SQL}) AS current_month,
                to_char(COALESCE(SUM(ledger.bonus_rub::numeric) FILTER (
                    WHERE ledger.awarded_at >= bounds.previous_month_from
                        AND ledger.awarded_at < bounds.current_month_from
                ), 0), ${MONEY_SQL}) AS previous_month,
                to_char(COALESCE(SUM(ledger.bonus_rub::numeric), 0), ${MONEY_SQL}) AS all_time,
                bounds.current_month_from, bounds.current_month_to, bounds.previous_month_from
            FROM month_bounds bounds
            LEFT JOIN referral_bonus_ledger ledger
                ON ledger.referrer_user_id = $1::uuid
                AND ledger.deleted_at IS NULL
                AND ledger.status::text = 'AWARDED'
            GROUP BY bounds.current_month_from, bounds.current_month_to, bounds.previous_month_from`,
            [userId, now],
        )

        const filters = this.inviteFilters(dto, query.parameterBuilder)
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
        const countRows = await this.dataSource.query(
            `${query.sql} SELECT COUNT(*)::text AS total FROM invited_metrics ${where}`,
            [...query.parameterBuilder.values],
        )
        const total = this.count(countRows[0]?.total)
        const sortMap: Record<AdminReferrerInviteSortBy, string> = {
            [AdminReferrerInviteSortBy.REGISTERED_AT]: 'registered_at',
            [AdminReferrerInviteSortBy.FIRST_PAID_AT]: 'first_paid_at',
            [AdminReferrerInviteSortBy.SUCCESSFUL_REVENUE]: 'successful_revenue',
        }
        const sort = sortMap[dto.sortBy || AdminReferrerInviteSortBy.REGISTERED_AT]
        const direction = dto.sortDir === AdminSortDirection.ASC ? 'ASC' : 'DESC'
        const nulls = sort !== 'registered_at' ? ' NULLS LAST' : ''
        const limit = query.parameterBuilder.add(dto.pageSize || 25)
        const offset = query.parameterBuilder.add(((dto.page || 1) - 1) * (dto.pageSize || 25))
        const rows = await this.dataSource.query(
            `${query.sql}
            SELECT invited_user_id, invited_email, invited_username, invited_first_name, invited_last_name,
                registered_at, first_paid_at, successful_payments::text,
                to_char(successful_revenue, ${MONEY_SQL}) AS successful_revenue,
                to_char(awarded_bonus, ${MONEY_SQL}) AS awarded_bonus,
                latest_ledger_status, latest_merchant, latest_plan_id, latest_plan_code, latest_plan_title, latest_promo_code
            FROM invited_metrics ${where}
            ORDER BY ${sort} ${direction}${nulls}, invited_user_id ${direction}
            LIMIT ${limit} OFFSET ${offset}`,
            query.parameterBuilder.values,
        )
        const summary = summaryRows[0]
        const earnings = earningsRows[0] || {}

        return {
            period: this.periodResponse(period),
            referrer: this.safeUser(
                this.raw(summary, 'referrerId', 'referrer_id'),
                this.raw(summary, 'referrerEmail', 'referrer_email'),
                this.raw(summary, 'referrerUsername', 'referrer_username'),
                this.raw(summary, 'referrerFirstName', 'referrer_first_name'),
                this.raw(summary, 'referrerLastName', 'referrer_last_name'),
            ),
            lifetimeAwardedBonus: this.money(this.raw(summary, 'lifetimeAwardedBonus', 'lifetime_awarded_bonus')),
            currentWalletBalance: this.money(this.raw(summary, 'currentWalletBalance', 'current_wallet_balance')),
            earnings: {
                currentMonth: this.money(this.raw(earnings, 'currentMonth', 'current_month')),
                previousMonth: this.money(this.raw(earnings, 'previousMonth', 'previous_month')),
                allTime: this.money(this.raw(earnings, 'allTime', 'all_time')),
                timezone: 'Europe/Moscow',
                currentMonthFrom: this.iso(this.raw(earnings, 'currentMonthFrom', 'current_month_from')),
                currentMonthTo: this.iso(this.raw(earnings, 'currentMonthTo', 'current_month_to')),
                previousMonthFrom: this.iso(this.raw(earnings, 'previousMonthFrom', 'previous_month_from')),
            },
            items: rows.map((row: any) => this.mapInvite(row)),
            total,
            page: dto.page || 1,
            pageSize: dto.pageSize || 25,
            totalPages: Math.max(1, Math.ceil(total / (dto.pageSize || 25))),
        }
    }

    private referrerBase(dto: AdminReferrerQueryDto, period: { from: Date; to: Date }) {
        const p = new SqlParameters()
        const from = p.add(period.from)
        const to = p.add(period.to)
        const eligibleFilters = ['referrer.deleted_at IS NULL']
        if (dto.referrerSearch) {
            const search = p.add(`%${dto.referrerSearch.toLowerCase()}%`)
            eligibleFilters.push(`(LOWER(referrer.email) LIKE ${search} OR LOWER(referrer.telegram_username) LIKE ${search}
                OR LOWER(referrer.telegram_first_name) LIKE ${search} OR LOWER(referrer.telegram_last_name) LIKE ${search})`)
        }
        const cashPayment = `pay.deleted_at IS NULL AND pay.status::text = 'SUCCEEDED' AND pay.paid_at IS NOT NULL
            AND pay.amount::numeric > 0 AND COALESCE(pay.kind::text, '${PaymentKind.EXTERNAL}') = '${PaymentKind.EXTERNAL}'`
        const sql = `WITH eligible_referrers AS (
                SELECT referrer.id, referrer.email, referrer.telegram_username, referrer.telegram_first_name,
                    referrer.telegram_last_name, referrer.total_referral_bonus_rub::numeric AS lifetime_awarded_bonus,
                    referrer.referral_bonus_balance_rub::numeric AS current_wallet_balance
                FROM users referrer WHERE ${eligibleFilters.join(' AND ')}
            ), invite_lifetime AS (
                SELECT invited.referred_by_user_id AS referrer_id, COUNT(invited.id) AS invited_users,
                    MIN(invited.created_at) AS first_referral_at, MAX(invited.created_at) AS last_referral_at
                FROM users invited WHERE invited.deleted_at IS NULL AND invited.referred_by_user_id IS NOT NULL
                GROUP BY invited.referred_by_user_id
            ), payment_lifetime AS (
                SELECT invited.referred_by_user_id AS referrer_id, COUNT(DISTINCT invited.id) AS paying_invited_users,
                    COUNT(pay.id) AS referred_successful_payments, COALESCE(SUM(pay.amount::numeric), 0) AS referred_gross_revenue
                FROM users invited JOIN payments pay ON pay.user_id = invited.id
                WHERE invited.deleted_at IS NULL AND invited.referred_by_user_id IS NOT NULL AND ${cashPayment}
                GROUP BY invited.referred_by_user_id
            ), ledger_lifetime AS (
                SELECT ledger.referrer_user_id AS referrer_id,
                    MAX(ledger.awarded_at) FILTER (WHERE ledger.status::text = 'AWARDED') AS last_awarded_at
                FROM referral_bonus_ledger ledger WHERE ledger.deleted_at IS NULL GROUP BY ledger.referrer_user_id
            ), invite_period AS (
                SELECT invited.referred_by_user_id AS referrer_id, COUNT(invited.id) AS invited_users,
                    MAX(invited.created_at) AS last_referral_at
                FROM users invited WHERE invited.deleted_at IS NULL AND invited.referred_by_user_id IS NOT NULL
                    AND invited.created_at >= ${from} AND invited.created_at < ${to}
                GROUP BY invited.referred_by_user_id
            ), payment_period AS (
                SELECT invited.referred_by_user_id AS referrer_id, COUNT(DISTINCT invited.id) AS paying_invited_users,
                    COUNT(pay.id) AS referred_successful_payments, COALESCE(SUM(pay.amount::numeric), 0) AS referred_gross_revenue
                FROM users invited JOIN payments pay ON pay.user_id = invited.id
                WHERE invited.deleted_at IS NULL AND invited.referred_by_user_id IS NOT NULL AND ${cashPayment}
                    AND pay.paid_at >= ${from} AND pay.paid_at < ${to}
                GROUP BY invited.referred_by_user_id
            ), ledger_period AS (
                SELECT ledger.referrer_user_id AS referrer_id, COALESCE(SUM(ledger.bonus_rub::numeric), 0) AS awarded_bonus
                FROM referral_bonus_ledger ledger WHERE ledger.deleted_at IS NULL AND ledger.status::text = 'AWARDED'
                    AND ledger.awarded_at >= ${from} AND ledger.awarded_at < ${to}
                GROUP BY ledger.referrer_user_id
            ), referrer_metrics AS (
                SELECT referrer.id AS referrer_id, referrer.email AS referrer_email,
                    referrer.telegram_username AS referrer_username, referrer.telegram_first_name AS referrer_first_name,
                    referrer.telegram_last_name AS referrer_last_name,
                    COALESCE(invite_lifetime.invited_users, 0) AS invited_users,
                    COALESCE(payment_lifetime.paying_invited_users, 0) AS paying_invited_users,
                    COALESCE(payment_lifetime.referred_successful_payments, 0) AS referred_successful_payments,
                    COALESCE(payment_lifetime.referred_gross_revenue, 0)::numeric AS referred_gross_revenue,
                    COALESCE(referrer.lifetime_awarded_bonus, 0)::numeric AS lifetime_awarded_bonus,
                    COALESCE(referrer.current_wallet_balance, 0)::numeric AS current_wallet_balance,
                    invite_lifetime.first_referral_at, invite_lifetime.last_referral_at, ledger_lifetime.last_awarded_at,
                    COALESCE(invite_period.invited_users, 0) AS period_invited_users,
                    COALESCE(payment_period.paying_invited_users, 0) AS period_paying_invited_users,
                    COALESCE(payment_period.referred_successful_payments, 0) AS period_successful_payments,
                    COALESCE(payment_period.referred_gross_revenue, 0)::numeric AS period_gross_revenue,
                    COALESCE(ledger_period.awarded_bonus, 0)::numeric AS period_awarded_bonus,
                    invite_period.last_referral_at AS period_last_referral_at
                FROM eligible_referrers referrer
                LEFT JOIN invite_lifetime ON invite_lifetime.referrer_id = referrer.id
                LEFT JOIN payment_lifetime ON payment_lifetime.referrer_id = referrer.id
                LEFT JOIN ledger_lifetime ON ledger_lifetime.referrer_id = referrer.id
                LEFT JOIN invite_period ON invite_period.referrer_id = referrer.id
                LEFT JOIN payment_period ON payment_period.referrer_id = referrer.id
                LEFT JOIN ledger_period ON ledger_period.referrer_id = referrer.id
            )`
        return { sql, parameterBuilder: p }
    }

    private referrerFilters(dto: AdminReferrerQueryDto, p: SqlParameters) {
        const scope = dto.metricScope === AdminReferrerMetricScope.PERIOD ? 'period_' : ''
        const filters: string[] = []
        if (dto.onlyWithInvited !== undefined) {
            const value = p.add(dto.onlyWithInvited)
            filters.push(
                `((${value}::boolean AND ${scope}invited_users > 0) OR (NOT ${value}::boolean AND ${scope}invited_users = 0))`,
            )
        }
        if (dto.onlyWithPayingInvited !== undefined) {
            const value = p.add(dto.onlyWithPayingInvited)
            filters.push(
                `((${value}::boolean AND ${scope}paying_invited_users > 0) OR (NOT ${value}::boolean AND ${scope}paying_invited_users = 0))`,
            )
        }
        return filters
    }

    private invitesBase(userId: string, dto: AdminReferrerInvitesQueryDto, period: { from: Date; to: Date }) {
        const p = new SqlParameters()
        const from = p.add(period.from)
        const to = p.add(period.to)
        const userIdParam = p.add(userId)
        const invitedFilters = [
            'invited.deleted_at IS NULL',
            `invited.referred_by_user_id = ${userIdParam}::uuid`,
            `invited.created_at >= ${from}`,
            `invited.created_at < ${to}`,
        ]
        if (dto.invitedSearch) {
            const search = p.add(`%${dto.invitedSearch.toLowerCase()}%`)
            invitedFilters.push(`(LOWER(invited.email) LIKE ${search} OR LOWER(invited.telegram_username) LIKE ${search}
                OR LOWER(invited.telegram_first_name) LIKE ${search} OR LOWER(invited.telegram_last_name) LIKE ${search})`)
        }
        const cashPayment = `pay.deleted_at IS NULL AND pay.status::text = 'SUCCEEDED' AND pay.paid_at >= ${from} AND pay.paid_at < ${to}
            AND pay.amount::numeric > 0 AND COALESCE(pay.kind::text, '${PaymentKind.EXTERNAL}') = '${PaymentKind.EXTERNAL}'`
        const sql = `WITH invited_metrics AS (
                SELECT invited.id AS invited_user_id, invited.email AS invited_email,
                    invited.telegram_username AS invited_username, invited.telegram_first_name AS invited_first_name,
                    invited.telegram_last_name AS invited_last_name, invited.created_at AS registered_at,
                    invited.first_paid_at, COALESCE(payment_metrics.successful_payments, 0) AS successful_payments,
                    COALESCE(payment_metrics.successful_revenue, 0)::numeric AS successful_revenue,
                    COALESCE(ledger_metrics.awarded_bonus, 0)::numeric AS awarded_bonus,
                    latest_ledger.latest_ledger_status, latest_payment.latest_merchant, latest_payment.latest_plan_id,
                    latest_payment.latest_plan_code, latest_payment.latest_plan_title, latest_payment.latest_promo_code
                FROM users invited
                LEFT JOIN LATERAL (
                    SELECT COUNT(pay.id) AS successful_payments, COALESCE(SUM(pay.amount::numeric), 0) AS successful_revenue
                    FROM payments pay WHERE pay.user_id = invited.id AND ${cashPayment}
                ) payment_metrics ON TRUE
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(ledger.bonus_rub::numeric), 0) AS awarded_bonus
                    FROM referral_bonus_ledger ledger WHERE ledger.referred_user_id = invited.id
                        AND ledger.deleted_at IS NULL AND ledger.status::text = 'AWARDED'
                        AND ledger.awarded_at >= ${from} AND ledger.awarded_at < ${to}
                ) ledger_metrics ON TRUE
                LEFT JOIN LATERAL (
                    SELECT ledger.status::text AS latest_ledger_status
                    FROM referral_bonus_ledger ledger WHERE ledger.referred_user_id = invited.id AND ledger.deleted_at IS NULL
                    ORDER BY COALESCE(ledger.awarded_at, ledger.created_at) DESC, ledger.id DESC LIMIT 1
                ) latest_ledger ON TRUE
                LEFT JOIN LATERAL (
                    SELECT pay.merchant::text AS latest_merchant, pay.plan_id AS latest_plan_id,
                        plan.code AS latest_plan_code, COALESCE(plan.title, plan.name) AS latest_plan_title,
                        promo.code AS latest_promo_code
                    FROM payments pay
                    LEFT JOIN plans plan ON plan.id = pay.plan_id AND plan.deleted_at IS NULL
                    LEFT JOIN promo_code promo ON promo.id::text = pay.metadata_snapshot ->> 'promo_id' AND promo.deleted_at IS NULL
                    WHERE pay.user_id = invited.id AND ${cashPayment}
                    ORDER BY pay.paid_at DESC, pay.id DESC LIMIT 1
                ) latest_payment ON TRUE
                WHERE ${invitedFilters.join(' AND ')}
            )`
        return { sql, parameterBuilder: p, userIdParam }
    }

    private inviteFilters(dto: AdminReferrerInvitesQueryDto, _p: SqlParameters) {
        if (dto.paidState === AdminReferrerInvitePaidState.EVER_PAID) return ['successful_payments > 0']
        if (dto.paidState === AdminReferrerInvitePaidState.NEVER_PAID) return ['successful_payments = 0']
        return []
    }

    private mapReferrer(row: any) {
        return {
            referrer: this.safeUser(
                this.raw(row, 'referrerId', 'referrer_id'),
                this.raw(row, 'referrerEmail', 'referrer_email'),
                this.raw(row, 'referrerUsername', 'referrer_username'),
                this.raw(row, 'referrerFirstName', 'referrer_first_name'),
                this.raw(row, 'referrerLastName', 'referrer_last_name'),
            ),
            invitedUsers: this.count(this.raw(row, 'invitedUsers', 'invited_users')),
            payingInvitedUsers: this.count(this.raw(row, 'payingInvitedUsers', 'paying_invited_users')),
            referralConversionPercent: this.money(
                this.raw(row, 'referralConversionPercent', 'referral_conversion_percent'),
            ),
            referredSuccessfulPayments: this.count(
                this.raw(row, 'referredSuccessfulPayments', 'referred_successful_payments'),
            ),
            referredGrossRevenue: this.money(this.raw(row, 'referredGrossRevenue', 'referred_gross_revenue')),
            lifetimeAwardedBonus: this.money(this.raw(row, 'lifetimeAwardedBonus', 'lifetime_awarded_bonus')),
            currentWalletBalance: this.money(this.raw(row, 'currentWalletBalance', 'current_wallet_balance')),
            firstReferralAt: this.iso(this.raw(row, 'firstReferralAt', 'first_referral_at')),
            lastReferralAt: this.iso(this.raw(row, 'lastReferralAt', 'last_referral_at')),
            lastAwardedAt: this.iso(this.raw(row, 'lastAwardedAt', 'last_awarded_at')),
            periodMetrics: {
                invitedUsers: this.count(this.raw(row, 'periodInvitedUsers', 'period_invited_users')),
                payingInvitedUsers: this.count(
                    this.raw(row, 'periodPayingInvitedUsers', 'period_paying_invited_users'),
                ),
                referredSuccessfulPayments: this.count(
                    this.raw(row, 'periodSuccessfulPayments', 'period_successful_payments'),
                ),
                referredGrossRevenue: this.money(this.raw(row, 'periodGrossRevenue', 'period_gross_revenue')),
                awardedBonus: this.money(this.raw(row, 'periodAwardedBonus', 'period_awarded_bonus')),
            },
        }
    }

    private mapInvite(row: any) {
        return {
            invitedUser: this.safeUser(
                this.raw(row, 'invitedUserId', 'invited_user_id'),
                this.raw(row, 'invitedEmail', 'invited_email'),
                this.raw(row, 'invitedUsername', 'invited_username'),
                this.raw(row, 'invitedFirstName', 'invited_first_name'),
                this.raw(row, 'invitedLastName', 'invited_last_name'),
            ),
            registeredAt: this.iso(this.raw(row, 'registeredAt', 'registered_at')),
            firstPaidAt: this.iso(this.raw(row, 'firstPaidAt', 'first_paid_at')),
            successfulPayments: this.count(this.raw(row, 'successfulPayments', 'successful_payments')),
            successfulRevenue: this.money(this.raw(row, 'successfulRevenue', 'successful_revenue')),
            awardedBonus: this.money(this.raw(row, 'awardedBonus', 'awarded_bonus')),
            latestLedgerStatus: this.raw(row, 'latestLedgerStatus', 'latest_ledger_status') || null,
            latestMerchant: this.raw(row, 'latestMerchant', 'latest_merchant') || null,
            latestPlan: {
                id: this.raw(row, 'latestPlanId', 'latest_plan_id') || null,
                code: this.raw(row, 'latestPlanCode', 'latest_plan_code') || null,
                title: this.raw(row, 'latestPlanTitle', 'latest_plan_title') || null,
            },
            latestPromoCode: this.raw(row, 'latestPromoCode', 'latest_promo_code') || null,
        }
    }

    private safeUser(id: string, email?: string, username?: string, first?: string, last?: string) {
        const name = [first, last].filter(Boolean).join(' ').trim()
        return {
            id,
            label: username ? `@${username}` : email || name || `user #${String(id).slice(0, 8)}`,
            email: email || null,
            telegramUsername: username || null,
        }
    }

    private periodResponse(period: { from: Date; to: Date; timezone: string; preset: unknown }) {
        return {
            from: period.from.toISOString(),
            to: period.to.toISOString(),
            timezone: period.timezone,
            preset: period.preset,
        }
    }

    private count(value: unknown): number {
        return Number.parseInt(String(value || '0'), 10) || 0
    }

    private money(value: unknown): string {
        const text = String(value ?? '0')
        const [whole, fraction = ''] = text.split('.')
        return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`
    }

    private raw(row: any, camel: string, snake: string) {
        return row[camel] ?? row[snake]
    }

    private iso(value: unknown): string | null {
        return value ? new Date(value as any).toISOString() : null
    }
}
