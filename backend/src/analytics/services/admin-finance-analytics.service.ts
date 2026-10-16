import { BadRequestException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'

import { PaymentKind } from '../../payment/enum/payment-kind.enum'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'
import { AdminAnalyticsFilterDto } from '../dto/admin-analytics-filter.dto'
import { AdminPaymentQueryDto, AdminPaymentSortBy, AdminPaymentTypeFilter } from '../dto/admin-payment-query.dto'
import { AdminMerchantFilter, AdminProviderFilter, AdminSortDirection } from '../dto/admin-query.helpers'
import { AdminReferralQueryDto, AdminReferralSortBy } from '../dto/admin-referral-query.dto'
import { AdminAnalyticsPeriodPreset } from '../enum/admin-analytics-period-preset.enum'
import { AdminPaymentType } from '../enum/admin-payment-type.enum'
import {
    ADMIN_ANALYTICS_TIMEZONE,
    ADMIN_ANALYTICS_DAY_MS as DAY_MS,
    moscowDateParts,
    moscowLocalToUtc,
    parseMoscowBoundary,
} from '../utils/admin-analytics-period.util'

const MONEY_SQL = "'FM999999999999990.00'"

type ResolvedPeriod = {
    from: Date
    to: Date
    timezone: typeof ADMIN_ANALYTICS_TIMEZONE
    preset: AdminAnalyticsPeriodPreset
}

class SqlParameters {
    readonly values: unknown[] = []
    add(value: unknown): string {
        this.values.push(value)
        return `$${this.values.length}`
    }
}

@Injectable()
export class AdminFinanceAnalyticsService {
    constructor(private readonly dataSource: DataSource) {}

    resolvePeriod(input: Pick<AdminAnalyticsFilterDto, 'preset' | 'dateFrom' | 'dateTo'>, now = new Date()): ResolvedPeriod {
        const preset = input.preset || AdminAnalyticsPeriodPreset.LAST_30_DAYS
        if (preset === AdminAnalyticsPeriodPreset.CUSTOM) {
            if (!input.dateFrom || !input.dateTo) throw new BadRequestException('CUSTOM requires dateFrom and dateTo')
            const from = parseMoscowBoundary(input.dateFrom)
            const to = parseMoscowBoundary(input.dateTo)
            if (!from || !to || from >= to) throw new BadRequestException('dateFrom must be before dateTo')
            if (to.getTime() - from.getTime() > 366 * DAY_MS) throw new BadRequestException('Custom range exceeds 366 days')
            return { from, to, timezone: ADMIN_ANALYTICS_TIMEZONE, preset }
        }
        if (input.dateFrom || input.dateTo) throw new BadRequestException('dateFrom/dateTo are allowed only for CUSTOM')

        const { year, month, day } = moscowDateParts(now)
        const today = this.moscowMidnight(year, month, day)
        let from = today
        let to = new Date(today.getTime() + DAY_MS)
        if (preset === AdminAnalyticsPeriodPreset.YESTERDAY) {
            from = new Date(today.getTime() - DAY_MS)
            to = today
        } else if (preset === AdminAnalyticsPeriodPreset.LAST_7_DAYS) {
            from = new Date(to.getTime() - 7 * DAY_MS)
        } else if (preset === AdminAnalyticsPeriodPreset.LAST_30_DAYS) {
            from = new Date(to.getTime() - 30 * DAY_MS)
        } else if (preset === AdminAnalyticsPeriodPreset.CURRENT_MONTH) {
            from = moscowLocalToUtc(year, month, 1)
            to = month === 12 ? moscowLocalToUtc(year + 1, 1, 1) : moscowLocalToUtc(year, month + 1, 1)
        } else if (preset === AdminAnalyticsPeriodPreset.PREVIOUS_MONTH) {
            to = moscowLocalToUtc(year, month, 1)
            from = month === 1 ? moscowLocalToUtc(year - 1, 12, 1) : moscowLocalToUtc(year, month - 1, 1)
        } else if (preset !== AdminAnalyticsPeriodPreset.TODAY) {
            throw new BadRequestException('Unsupported period preset')
        }
        return { from, to, timezone: ADMIN_ANALYTICS_TIMEZONE, preset }
    }

    async getMoneyOverview(dto: AdminAnalyticsFilterDto) {
        const period = this.resolvePeriod(dto)
        const base = this.paymentBase(dto, period)
        const rows = await this.dataSource.query(`${base.sql}
            SELECT
                to_char(COALESCE(SUM(amount_numeric) FILTER (WHERE status = 'SUCCEEDED' AND is_cash), 0), ${MONEY_SQL}) AS "grossRevenue",
                COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash)::text AS "successfulPayments",
                COUNT(DISTINCT user_id) FILTER (WHERE status = 'SUCCEEDED' AND is_cash)::text AS "uniquePayingUsers",
                to_char(COALESCE(AVG(amount_numeric) FILTER (WHERE status = 'SUCCEEDED' AND is_cash), 0), ${MONEY_SQL}) AS "averageCheck",
                COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash AND payment_type = 'FIRST_PURCHASE')::text AS "firstPurchases",
                COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash AND payment_type = 'MANUAL_RENEWAL')::text AS "manualRenewals",
                COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash AND payment_type = 'RECURRENT')::text AS "recurrentPayments",
                COUNT(*) FILTER (WHERE status = 'FAILED')::text AS "failedPayments",
                COUNT(*) FILTER (WHERE status = 'CANCELED')::text AS "canceledPayments",
                COUNT(*) FILTER (WHERE status = 'EXPIRED')::text AS "expiredPayments"
            FROM payment_base`, base.params)
        const row = rows[0] || {}
        return {
            period: this.periodResponse(period),
            grossRevenue: row.grossRevenue || '0.00',
            successfulPayments: this.count(row.successfulPayments),
            uniquePayingUsers: this.count(row.uniquePayingUsers),
            averageCheck: row.averageCheck || '0.00',
            firstPurchases: this.count(row.firstPurchases),
            manualRenewals: this.count(row.manualRenewals),
            recurrentPayments: this.count(row.recurrentPayments),
            failedPayments: this.count(row.failedPayments),
            canceledPayments: this.count(row.canceledPayments),
            expiredPayments: this.count(row.expiredPayments),
        }
    }

    async getTimeseries(dto: AdminAnalyticsFilterDto) {
        const period = this.resolvePeriod(dto)
        const base = this.paymentBase(dto, period)
        const fromParam = base.parameterBuilder.add(period.from)
        const toParam = base.parameterBuilder.add(period.to)
        const items = await this.dataSource.query(`${base.sql}, days AS (
                SELECT generate_series(
                    (${fromParam}::timestamptz AT TIME ZONE '${ADMIN_ANALYTICS_TIMEZONE}')::date,
                    ((${toParam}::timestamptz - interval '1 microsecond') AT TIME ZONE '${ADMIN_ANALYTICS_TIMEZONE}')::date,
                    interval '1 day'
                )::date AS day
            ), daily AS (
                SELECT (event_at AT TIME ZONE '${ADMIN_ANALYTICS_TIMEZONE}')::date AS day,
                    SUM(amount_numeric) FILTER (WHERE status = 'SUCCEEDED' AND is_cash) AS revenue,
                    COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash) AS successful,
                    COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash AND payment_type = 'FIRST_PURCHASE') AS first_count,
                    COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash AND payment_type = 'MANUAL_RENEWAL') AS manual_count,
                    COUNT(*) FILTER (WHERE status = 'SUCCEEDED' AND is_cash AND payment_type = 'RECURRENT') AS recurrent_count,
                    COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count,
                    COUNT(*) FILTER (WHERE status = 'CANCELED') AS canceled_count
                FROM payment_base GROUP BY 1
            )
            SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
                to_char(COALESCE(daily.revenue, 0), ${MONEY_SQL}) AS "grossRevenue",
                COALESCE(daily.successful, 0)::text AS "successfulPayments",
                COALESCE(daily.first_count, 0)::text AS "firstPurchases",
                COALESCE(daily.manual_count, 0)::text AS "manualRenewals",
                COALESCE(daily.recurrent_count, 0)::text AS "recurrentPayments",
                COALESCE(daily.failed_count, 0)::text AS "failedPayments",
                COALESCE(daily.canceled_count, 0)::text AS "canceledPayments"
            FROM days LEFT JOIN daily USING (day) ORDER BY days.day`, base.parameterBuilder.values)
        return { period: this.periodResponse(period), items: items.map((row: any) => this.mapTimeseries(row)) }
    }

    async getBreakdowns(dto: AdminAnalyticsFilterDto) {
        const period = this.resolvePeriod(dto)
        const dimensions: Array<[string, string, string, string]> = [
            ['merchant', "COALESCE(merchant, 'UNKNOWN')", 'WHERE is_cash', "status = 'SUCCEEDED'"],
            ['provider', "COALESCE(UPPER(provider), 'UNKNOWN')", 'WHERE is_cash', "status = 'SUCCEEDED'"],
            ['paymentType', 'payment_type', 'WHERE is_cash', "status = 'SUCCEEDED'"],
            ['status', 'status', '', "status = 'SUCCEEDED' AND is_cash"],
        ]
        const results: Record<string, any[]> = {}
        for (const [name, expression, where, successfulPredicate] of dimensions) {
            const base = this.paymentBase(dto, period)
            const rows = await this.dataSource.query(`${base.sql}
                SELECT ${expression} AS key, ${expression} AS label,
                    COUNT(*) FILTER (WHERE ${successfulPredicate})::text AS "successfulPayments",
                    to_char(COALESCE(SUM(amount_numeric) FILTER (WHERE status = 'SUCCEEDED' AND is_cash), 0), ${MONEY_SQL}) AS "grossRevenue"
                FROM payment_base ${where} GROUP BY 1
                ORDER BY COALESCE(SUM(amount_numeric) FILTER (WHERE status = 'SUCCEEDED' AND is_cash), 0) DESC, key ASC`, base.params)
            results[name] = rows.map((row: any) => this.mapBreakdown(row))
        }
        const planBase = this.paymentBase(dto, period)
        const byPlan = await this.dataSource.query(`${planBase.sql}, plan_totals AS (
                SELECT COALESCE(plan_id::text, 'NONE') AS key, COALESCE(plan_title, plan_code, 'Без тарифа') AS label,
                    COUNT(*) FILTER (WHERE status = 'SUCCEEDED') AS successful,
                    COALESCE(SUM(amount_numeric) FILTER (WHERE status = 'SUCCEEDED' AND is_cash), 0) AS revenue
                FROM payment_base WHERE is_cash GROUP BY 1, 2
            ), ranked AS (SELECT *, row_number() OVER (ORDER BY revenue DESC, key ASC) AS rank FROM plan_totals)
            SELECT CASE WHEN rank <= 10 THEN key ELSE 'OTHER' END AS key,
                CASE WHEN rank <= 10 THEN label ELSE 'OTHER' END AS label,
                SUM(successful)::text AS "successfulPayments", to_char(SUM(revenue), ${MONEY_SQL}) AS "grossRevenue"
            FROM ranked GROUP BY 1, 2 ORDER BY MAX(CASE WHEN rank <= 10 THEN rank ELSE 11 END), key`, planBase.params)
        const promoBase = this.paymentBase(dto, period)
        const promoUsage = await this.dataSource.query(`${promoBase.sql}
            SELECT COALESCE(promo_code, 'NONE') AS key, COALESCE(promo_code, 'Без промокода') AS label,
                COUNT(*)::text AS "usageCount"
            FROM payment_base WHERE promo_code IS NOT NULL AND status = 'SUCCEEDED' AND is_cash GROUP BY 1, 2 ORDER BY COUNT(*) DESC, key ASC`, promoBase.params)
        return {
            period: this.periodResponse(period),
            byMerchant: results.merchant,
            byProvider: results.provider,
            byPaymentType: results.paymentType,
            byPlan: byPlan.map((row: any) => this.mapBreakdown(row)),
            byStatus: results.status,
            promoUsage: promoUsage.map((row: any) => ({ key: row.key, label: row.label, usageCount: this.count(row.usageCount) })),
        }
    }

    async listPayments(dto: AdminPaymentQueryDto) {
        const period = this.resolvePeriod(dto)
        const base = this.paymentBase(dto, period)
        const outer: string[] = ['b.is_cash']
        if (dto.statuses?.length) outer.push(`b.status = ANY(${base.parameterBuilder.add(dto.statuses)}::text[])`)
        if (dto.paymentType && dto.paymentType !== AdminPaymentTypeFilter.ALL) {
            outer.push(`b.payment_type = ${base.parameterBuilder.add(dto.paymentType)}`)
        }
        const where = outer.length ? `WHERE ${outer.join(' AND ')}` : ''
        const countRows = await this.dataSource.query(`${base.sql} SELECT COUNT(*)::text AS total FROM payment_base b ${where}`, base.parameterBuilder.values)
        const total = this.count(countRows[0]?.total)
        const sortColumns: Record<AdminPaymentSortBy, string> = {
            [AdminPaymentSortBy.PAID_AT]: 'b.paid_at',
            [AdminPaymentSortBy.CREATED_AT]: 'b.created_at',
            [AdminPaymentSortBy.AMOUNT]: 'b.amount_numeric',
            [AdminPaymentSortBy.STATUS]: 'b.status',
        }
        const sort = sortColumns[dto.sortBy || AdminPaymentSortBy.PAID_AT]
        const direction = dto.sortDir === AdminSortDirection.ASC ? 'ASC' : 'DESC'
        const nulls = sort === 'b.paid_at' ? ' NULLS LAST' : ''
        const limit = base.parameterBuilder.add(dto.pageSize || 25)
        const offset = base.parameterBuilder.add(((dto.page || 1) - 1) * (dto.pageSize || 25))
        const rows = await this.dataSource.query(`${base.sql}
            SELECT b.* FROM payment_base b ${where}
            ORDER BY ${sort} ${direction}${nulls}, b.created_at ${direction}, b.id ${direction}
            LIMIT ${limit} OFFSET ${offset}`, base.parameterBuilder.values)
        return {
            period: this.periodResponse(period), items: rows.map((row: any) => this.mapPayment(row)), total,
            page: dto.page || 1, pageSize: dto.pageSize || 25,
            totalPages: Math.max(1, Math.ceil(total / (dto.pageSize || 25))),
        }
    }

    async getReferralOverview(dto: AdminReferralQueryDto) {
        const period = this.resolvePeriod(dto as any)
        const p = new SqlParameters()
        const from = p.add(period.from)
        const to = p.add(period.to)
        const userFilters = ['invited.deleted_at IS NULL', 'invited.referred_by_user_id IS NOT NULL', 'referrer.deleted_at IS NULL']
        if (dto.referrerSearch) {
            const value = p.add(`%${dto.referrerSearch.toLowerCase()}%`)
            userFilters.push(`(LOWER(referrer.email) LIKE ${value} OR LOWER(referrer.telegram_username) LIKE ${value})`)
        }
        if (dto.invitedSearch) {
            const value = p.add(`%${dto.invitedSearch.toLowerCase()}%`)
            userFilters.push(`(LOWER(invited.email) LIKE ${value} OR LOWER(invited.telegram_username) LIKE ${value})`)
        }
        const paymentFilters = [`pay.status = 'SUCCEEDED'`, `pay.paid_at >= ${from}`, `pay.paid_at < ${to}`,
            `pay.amount::numeric > 0`, `COALESCE(pay.kind::text, '${PaymentKind.EXTERNAL}') = '${PaymentKind.EXTERNAL}'`, 'pay.deleted_at IS NULL']
        if (dto.merchant && dto.merchant !== AdminMerchantFilter.ALL) paymentFilters.push(`pay.merchant::text = ${p.add(dto.merchant)}`)
        if (dto.planId) paymentFilters.push(`pay.plan_id = ${p.add(dto.planId)}::uuid`)
        if (dto.promoCode) paymentFilters.push(`UPPER(pay_promo.code) = ${p.add(dto.promoCode)}`)
        const ledgerStatus = dto.ledgerStatus?.length ? `AND ledger.status::text = ANY(${p.add(dto.ledgerStatus)}::text[])` : ''
        const rows = await this.dataSource.query(`WITH referred_users AS (
                SELECT invited.id, invited.created_at FROM users invited
                JOIN users referrer ON referrer.id = invited.referred_by_user_id
                WHERE ${userFilters.join(' AND ')}
            ), registrations AS (
                SELECT COUNT(*) AS value FROM referred_users WHERE created_at >= ${from} AND created_at < ${to}
            ), payment_metrics AS (
                SELECT COUNT(DISTINCT ru.id) AS paying_users, COUNT(pay.id) AS successful_payments,
                    COALESCE(SUM(pay.amount::numeric), 0) AS revenue
                FROM referred_users ru JOIN payments pay ON pay.user_id = ru.id
                LEFT JOIN promo_code pay_promo ON pay_promo.id::text = pay.metadata_snapshot ->> 'promo_id'
                WHERE ${paymentFilters.join(' AND ')}
            ), ledger_metrics AS (
                SELECT COALESCE(SUM(ledger.bonus_rub::numeric) FILTER (WHERE ledger.status = 'AWARDED' AND ledger.awarded_at >= ${from} AND ledger.awarded_at < ${to}), 0) AS awarded,
                    COUNT(*) FILTER (WHERE ledger.status = 'PENDING_WINDOW' AND ledger.created_at >= ${from} AND ledger.created_at < ${to}) AS pending,
                    COUNT(*) FILTER (WHERE ledger.status = 'REJECTED' AND ledger.created_at >= ${from} AND ledger.created_at < ${to}) AS rejected
                FROM referral_bonus_ledger ledger JOIN referred_users ru ON ru.id = ledger.referred_user_id
                WHERE ledger.deleted_at IS NULL ${ledgerStatus}
            )
            SELECT registrations.value::text AS "referredRegistrations", payment_metrics.paying_users::text AS "referredPayingUsers",
                payment_metrics.successful_payments::text AS "successfulPayments",
                to_char(CASE WHEN registrations.value = 0 THEN 0 ELSE payment_metrics.paying_users::numeric * 100 / registrations.value END, ${MONEY_SQL}) AS "conversionPercent",
                to_char(payment_metrics.revenue, ${MONEY_SQL}) AS "referredGrossRevenue", to_char(ledger_metrics.awarded, ${MONEY_SQL}) AS "awardedBonusTotal",
                ledger_metrics.pending::text AS "pendingBonusCount", ledger_metrics.rejected::text AS "rejectedBonusCount"
            FROM registrations CROSS JOIN payment_metrics CROSS JOIN ledger_metrics`, p.values)
        const row = rows[0] || {}
        return {
            period: this.periodResponse(period),
            referredRegistrations: this.count(row.referredRegistrations), referredPayingUsers: this.count(row.referredPayingUsers),
            successfulPayments: this.count(row.successfulPayments),
            conversionPercent: row.conversionPercent || '0.00', referredGrossRevenue: row.referredGrossRevenue || '0.00',
            awardedBonusTotal: row.awardedBonusTotal || '0.00', pendingBonusCount: this.count(row.pendingBonusCount),
            rejectedBonusCount: this.count(row.rejectedBonusCount),
        }
    }

    async listReferrals(dto: AdminReferralQueryDto) {
        const period = this.resolvePeriod(dto as any)
        const query = this.referralBase(dto, period)
        const filters: string[] = []
        if (dto.ledgerStatus?.length) filters.push(`latest_ledger_status = ANY(${query.parameterBuilder.add(dto.ledgerStatus)}::text[])`)
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
        const countRows = await this.dataSource.query(`${query.sql} SELECT COUNT(*)::text AS total FROM referral_base ${where}`, query.parameterBuilder.values)
        const total = this.count(countRows[0]?.total)
        const sortMap: Record<AdminReferralSortBy, string> = {
            [AdminReferralSortBy.REGISTERED_AT]: 'registered_at', [AdminReferralSortBy.FIRST_PAID_AT]: 'first_paid_at',
            [AdminReferralSortBy.SUCCESSFUL_REVENUE]: 'successful_revenue', [AdminReferralSortBy.AWARDED_BONUS]: 'awarded_bonus',
        }
        const direction = dto.sortDir === AdminSortDirection.ASC ? 'ASC' : 'DESC'
        const sort = sortMap[dto.sortBy || AdminReferralSortBy.REGISTERED_AT]
        const limit = query.parameterBuilder.add(dto.pageSize || 25)
        const offset = query.parameterBuilder.add(((dto.page || 1) - 1) * (dto.pageSize || 25))
        const rows = await this.dataSource.query(`${query.sql} SELECT * FROM referral_base ${where}
            ORDER BY ${sort} ${direction} NULLS LAST, invited_user_id ${direction} LIMIT ${limit} OFFSET ${offset}`, query.parameterBuilder.values)
        return {
            period: this.periodResponse(period), items: rows.map((row: any) => this.mapReferral(row)), total,
            page: dto.page || 1, pageSize: dto.pageSize || 25,
            totalPages: Math.max(1, Math.ceil(total / (dto.pageSize || 25))),
        }
    }

    private paymentBase(dto: AdminAnalyticsFilterDto, period: ResolvedPeriod) {
        const p = new SqlParameters()
        const from = p.add(period.from)
        const to = p.add(period.to)
        const filters = [
            'p.deleted_at IS NULL',
            `((p.status = 'SUCCEEDED' AND p.paid_at >= ${from} AND p.paid_at < ${to}) OR (p.status <> 'SUCCEEDED' AND p.created_at >= ${from} AND p.created_at < ${to}))`,
        ]
        if (dto.provider && dto.provider !== AdminProviderFilter.ALL) filters.push(`UPPER(p.provider) = ${p.add(dto.provider)}`)
        if (dto.merchant && dto.merchant !== AdminMerchantFilter.ALL) filters.push(`p.merchant::text = ${p.add(dto.merchant)}`)
        if (dto.planId) filters.push(`p.plan_id = ${p.add(dto.planId)}::uuid`)
        if (dto.promoCode) filters.push(`UPPER(pc.code) = ${p.add(dto.promoCode)}`)
        if (dto.userSearch) {
            filters.push(`(LOWER(u.email) LIKE ${p.add(`%${dto.userSearch.toLowerCase()}%`)} OR LOWER(u.telegram_username) LIKE ${p.add(`%${dto.userSearch.toLowerCase()}%`)})`)
        }
        if (dto.referred === true) filters.push('u.referred_by_user_id IS NOT NULL')
        if (dto.referred === false) filters.push('u.referred_by_user_id IS NULL')
        const type = this.paymentTypeSql('p')
        const sql = `WITH payment_base AS (
            SELECT p.id, p.created_at, p.paid_at, p.user_id, p.merchant::text AS merchant, p.provider,
                ${type} AS payment_type, p.plan_id, pl.code AS plan_code, COALESCE(pl.title, pl.name) AS plan_title,
                pc.code AS promo_code, p.amount::numeric AS amount_numeric,
                to_char(p.amount::numeric, ${MONEY_SQL}) AS amount, p.currency, p.status::text AS status,
                p.activation_status::text AS activation_status,
                u.email AS user_email, u.telegram_username AS user_telegram_username,
                u.telegram_first_name AS user_first_name, u.telegram_last_name AS user_last_name,
                (p.amount::numeric > 0 AND COALESCE(p.kind::text, '${PaymentKind.EXTERNAL}') = '${PaymentKind.EXTERNAL}') AS is_cash,
                CASE WHEN p.status = 'SUCCEEDED' THEN p.paid_at ELSE p.created_at END AS event_at
            FROM payments p
            LEFT JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
            LEFT JOIN plans pl ON pl.id = p.plan_id AND pl.deleted_at IS NULL
            LEFT JOIN promo_code pc ON pc.id::text = p.metadata_snapshot ->> 'promo_id' AND pc.deleted_at IS NULL
            WHERE ${filters.join(' AND ')}
        )`
        return { sql, params: p.values, parameterBuilder: p }
    }

    private referralBase(dto: AdminReferralQueryDto, period: ResolvedPeriod) {
        const p = new SqlParameters()
        const from = p.add(period.from)
        const to = p.add(period.to)
        const filters = [`invited.deleted_at IS NULL`, `invited.referred_by_user_id IS NOT NULL`, `invited.created_at >= ${from}`, `invited.created_at < ${to}`]
        if (dto.referrerSearch) {
            const value = p.add(`%${dto.referrerSearch.toLowerCase()}%`)
            filters.push(`(LOWER(referrer.email) LIKE ${value} OR LOWER(referrer.telegram_username) LIKE ${value})`)
        }
        if (dto.invitedSearch) {
            const value = p.add(`%${dto.invitedSearch.toLowerCase()}%`)
            filters.push(`(LOWER(invited.email) LIKE ${value} OR LOWER(invited.telegram_username) LIKE ${value})`)
        }
        const paymentFilters = [`pay.status = 'SUCCEEDED'`, `pay.paid_at >= ${from}`, `pay.paid_at < ${to}`, `pay.amount::numeric > 0`, `COALESCE(pay.kind::text, '${PaymentKind.EXTERNAL}') = '${PaymentKind.EXTERNAL}'`, 'pay.deleted_at IS NULL']
        if (dto.merchant && dto.merchant !== AdminMerchantFilter.ALL) paymentFilters.push(`pay.merchant::text = ${p.add(dto.merchant)}`)
        if (dto.planId) paymentFilters.push(`pay.plan_id = ${p.add(dto.planId)}::uuid`)
        if (dto.promoCode) paymentFilters.push(`UPPER(pay_promo.code) = ${p.add(dto.promoCode)}`)
        const sql = `WITH referral_base AS (
            SELECT invited.id AS invited_user_id, invited.created_at AS registered_at, invited.first_paid_at,
                invited.email AS invited_email, invited.telegram_username AS invited_username,
                invited.telegram_first_name AS invited_first_name, invited.telegram_last_name AS invited_last_name,
                referrer.id AS referrer_id, referrer.email AS referrer_email, referrer.telegram_username AS referrer_username,
                referrer.telegram_first_name AS referrer_first_name, referrer.telegram_last_name AS referrer_last_name,
                COALESCE(payments.successful_payments, 0) AS successful_payments,
                COALESCE(payments.successful_revenue, 0)::numeric AS successful_revenue,
                COALESCE(ledger.awarded_bonus, 0)::numeric AS awarded_bonus,
                COALESCE(ledger.pending_count, 0) AS pending_count, COALESCE(ledger.rejected_count, 0) AS rejected_count,
                ledger.latest_ledger_status, latest.merchant AS latest_merchant, latest.plan_id AS latest_plan_id,
                latest.plan_code, latest.plan_title, latest.promo_code AS latest_promo_code
            FROM users invited
            JOIN users referrer ON referrer.id = invited.referred_by_user_id AND referrer.deleted_at IS NULL
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS successful_payments, SUM(pay.amount::numeric) AS successful_revenue
                FROM payments pay LEFT JOIN promo_code pay_promo ON pay_promo.id::text = pay.metadata_snapshot ->> 'promo_id'
                WHERE pay.user_id = invited.id AND ${paymentFilters.join(' AND ')}
            ) payments ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(l.bonus_rub::numeric) FILTER (WHERE l.status = 'AWARDED' AND l.awarded_at >= ${from} AND l.awarded_at < ${to}) AS awarded_bonus,
                    COUNT(*) FILTER (WHERE l.status = 'PENDING_WINDOW' AND l.created_at >= ${from} AND l.created_at < ${to}) AS pending_count,
                    COUNT(*) FILTER (WHERE l.status = 'REJECTED' AND l.created_at >= ${from} AND l.created_at < ${to}) AS rejected_count,
                    (array_agg(l.status::text ORDER BY COALESCE(l.awarded_at, l.created_at) DESC, l.id DESC))[1] AS latest_ledger_status
                FROM referral_bonus_ledger l WHERE l.referred_user_id = invited.id AND l.deleted_at IS NULL
            ) ledger ON TRUE
            LEFT JOIN LATERAL (
                SELECT pay.merchant::text AS merchant, pay.plan_id, pl.code AS plan_code, COALESCE(pl.title, pl.name) AS plan_title, pay_promo.code AS promo_code
                FROM payments pay LEFT JOIN plans pl ON pl.id = pay.plan_id
                LEFT JOIN promo_code pay_promo ON pay_promo.id::text = pay.metadata_snapshot ->> 'promo_id'
                WHERE pay.user_id = invited.id AND ${paymentFilters.join(' AND ')}
                ORDER BY pay.paid_at DESC, pay.id DESC LIMIT 1
            ) latest ON TRUE
            WHERE ${filters.join(' AND ')}
        )`
        return { sql, params: p.values, parameterBuilder: p }
    }

    private paymentTypeSql(alias: string): string {
        return `CASE
            WHEN ${alias}.kind::text = '${PaymentKind.BONUS_BALANCE}' THEN '${AdminPaymentType.BONUS}'
            WHEN ${alias}.kind::text = '${PaymentKind.PROMO_DISCOUNT}' THEN '${AdminPaymentType.PROMO_DISCOUNT}'
            WHEN ${alias}.is_recurring = TRUE THEN '${AdminPaymentType.RECURRENT}'
            WHEN NOT EXISTS (
                SELECT 1 FROM payments earlier
                WHERE earlier.user_id = ${alias}.user_id AND earlier.status = '${PaymentStatusEnum.SUCCEEDED}'
                  AND earlier.deleted_at IS NULL AND (earlier.paid_at < ${alias}.paid_at OR (earlier.paid_at = ${alias}.paid_at AND earlier.id < ${alias}.id))
            ) THEN '${AdminPaymentType.FIRST_PURCHASE}'
            ELSE '${AdminPaymentType.MANUAL_RENEWAL}' END`
    }

    private mapPayment(row: any) {
        const userFirstName = this.raw(row, 'userFirstName', 'user_first_name')
        const userLastName = this.raw(row, 'userLastName', 'user_last_name')
        const userTelegramUsername = this.raw(row, 'userTelegramUsername', 'user_telegram_username')
        const userEmail = this.raw(row, 'userEmail', 'user_email')
        const userId = this.raw(row, 'userId', 'user_id')
        const name = [userFirstName, userLastName].filter(Boolean).join(' ').trim()
        const label = userTelegramUsername ? `@${userTelegramUsername}` : userEmail || name || `user #${String(userId || row.id).slice(0, 8)}`
        return {
            id: row.id, shortId: String(row.id).slice(0, 8), createdAt: this.iso(this.raw(row, 'createdAt', 'created_at')),
            paidAt: this.iso(this.raw(row, 'paidAt', 'paid_at')),
            user: { id: userId || null, label, email: userEmail || null, telegramUsername: userTelegramUsername || null },
            merchant: row.merchant || null, provider: row.provider, paymentType: this.raw(row, 'paymentType', 'payment_type'),
            plan: { id: this.raw(row, 'planId', 'plan_id') || null, code: this.raw(row, 'planCode', 'plan_code') || null, title: this.raw(row, 'planTitle', 'plan_title') || null },
            promoCode: this.raw(row, 'promoCode', 'promo_code') || null, amount: this.money(row.amount), currency: row.currency,
            status: row.status, activationStatus: this.raw(row, 'activationStatus', 'activation_status') || null,
        }
    }

    private mapReferral(row: any) {
        return {
            referrer: this.safeUser(this.raw(row, 'referrerId', 'referrer_id'), this.raw(row, 'referrerEmail', 'referrer_email'), this.raw(row, 'referrerUsername', 'referrer_username'), this.raw(row, 'referrerFirstName', 'referrer_first_name'), this.raw(row, 'referrerLastName', 'referrer_last_name')),
            invitedUser: this.safeUser(this.raw(row, 'invitedUserId', 'invited_user_id'), this.raw(row, 'invitedEmail', 'invited_email'), this.raw(row, 'invitedUsername', 'invited_username'), this.raw(row, 'invitedFirstName', 'invited_first_name'), this.raw(row, 'invitedLastName', 'invited_last_name')),
            registeredAt: this.iso(this.raw(row, 'registeredAt', 'registered_at')), firstPaidAt: this.iso(this.raw(row, 'firstPaidAt', 'first_paid_at')),
            successfulPayments: this.count(this.raw(row, 'successfulPayments', 'successful_payments')),
            successfulRevenue: this.money(this.raw(row, 'successfulRevenue', 'successful_revenue')),
            awardedBonus: this.money(this.raw(row, 'awardedBonus', 'awarded_bonus')),
            latestLedgerStatus: this.raw(row, 'latestLedgerStatus', 'latest_ledger_status') || null,
            latestMerchant: this.raw(row, 'latestMerchant', 'latest_merchant') || null,
            latestPlan: { id: this.raw(row, 'latestPlanId', 'latest_plan_id') || null, code: this.raw(row, 'planCode', 'plan_code') || null, title: this.raw(row, 'planTitle', 'plan_title') || null },
            latestPromoCode: this.raw(row, 'latestPromoCode', 'latest_promo_code') || null,
        }
    }

    private safeUser(id: string, email?: string, username?: string, first?: string, last?: string) {
        const name = [first, last].filter(Boolean).join(' ').trim()
        return { id, label: username ? `@${username}` : email || name || `user #${String(id).slice(0, 8)}`, email: email || null, telegramUsername: username || null }
    }

    private mapTimeseries(row: any) {
        return { date: row.date, grossRevenue: row.grossRevenue || '0.00', successfulPayments: this.count(row.successfulPayments),
            firstPurchases: this.count(row.firstPurchases), manualRenewals: this.count(row.manualRenewals), recurrentPayments: this.count(row.recurrentPayments),
            failedPayments: this.count(row.failedPayments), canceledPayments: this.count(row.canceledPayments) }
    }

    private mapBreakdown(row: any) {
        return { key: String(row.key), label: String(row.label), successfulPayments: this.count(row.successfulPayments), grossRevenue: row.grossRevenue || '0.00' }
    }

    private periodResponse(period: ResolvedPeriod) {
        return { from: period.from.toISOString(), to: period.to.toISOString(), timezone: period.timezone, preset: period.preset }
    }

    private count(value: unknown): number { return Number.parseInt(String(value || '0'), 10) || 0 }
    private money(value: unknown): string {
        const text = String(value ?? '0')
        const [whole, fraction = ''] = text.split('.')
        return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`
    }
    private raw(row: any, camel: string, snake: string) { return row[camel] ?? row[snake] }
    private iso(value: unknown): string | null { return value ? new Date(value as any).toISOString() : null }

    private moscowMidnight(year: number, month: number, day: number): Date {
        return moscowLocalToUtc(year, month, day)
    }
}
