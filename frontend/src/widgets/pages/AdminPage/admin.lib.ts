import apiClient from "@/shared/api/client";

import { buildAdminUrl } from "./admin-stage3";
import type {
  AdminAnalyticsFilters,
  AdminMoneyBreakdowns,
  AdminMoneyOverview,
  AdminMoneyTimeseries,
  AdminPaymentPage,
  AdminPaymentQuery,
  AdminReferralOverview,
  AdminReferralPage,
  AdminReferralQuery,
  AdminReferrerInvitesPage,
  AdminReferrerInvitesQuery,
  AdminReferrerPage,
  AdminReferrerQuery,
  AdminSafeUsersPage,
  AdminUserDetails,
  AdminUserAccessResponse,
  AdminPlategaRecurrentAgreement,
  AdminUserQuery,
  AdminRetentionOverview,
  AdminRetentionUsersPage,
  AdminRetentionUsersQuery,
  AdminRetentionCohorts,
  PlanCatalogDraftCell,
  PromoFormState,
} from "./admin.types";

export const SUPPORT_MESSAGES_PAGE_SIZE = 20;

export const initialPlanCatalogDraft: PlanCatalogDraftCell[] = [];

export const initialPromoForm: PromoFormState = {
  code: "",
  name: "",
  valuePercent: 10,
  maxUses: 100,
  durationDays: 0,
  devicesLimit: 0,
  status: "ACTIVE",
};

export function formatDate(value?: string | null) {
  if (!value) {
    return "не задано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const payload = (
      error as Error & { payload?: { message?: string; description?: string } }
    ).payload;
    return payload?.description || payload?.message || error.message;
  }

  return "Не удалось выполнить запрос.";
}

export function buildPlanCatalogDraftKey(period: number, devicesLimit: number) {
  return `${period}:${devicesLimit}`;
}

export async function adminGet<T>(url: string, signal?: AbortSignal) {
  const response = await apiClient<T>({ method: "GET", url, signal });
  return response.data;
}

export const getAdminMoneyOverview = (
  filters: AdminAnalyticsFilters,
  signal?: AbortSignal,
) =>
  adminGet<AdminMoneyOverview>(
    buildAdminUrl("/api/admin/analytics/money/overview", filters),
    signal,
  );
export const getAdminMoneyTimeseries = (
  filters: AdminAnalyticsFilters,
  signal?: AbortSignal,
) =>
  adminGet<AdminMoneyTimeseries>(
    buildAdminUrl("/api/admin/analytics/money/timeseries", filters),
    signal,
  );
export const getAdminMoneyBreakdowns = (
  filters: AdminAnalyticsFilters,
  signal?: AbortSignal,
) =>
  adminGet<AdminMoneyBreakdowns>(
    buildAdminUrl("/api/admin/analytics/money/breakdowns", filters),
    signal,
  );
export const getAdminPayments = (
  query: AdminPaymentQuery,
  signal?: AbortSignal,
) =>
  adminGet<AdminPaymentPage>(
    buildAdminUrl("/api/admin/analytics/money/payments", query),
    signal,
  );
export const getAdminReferralOverview = (
  filters: AdminReferralQuery,
  signal?: AbortSignal,
) =>
  adminGet<AdminReferralOverview>(
    buildAdminUrl("/api/admin/analytics/referrals/overview", filters),
    signal,
  );
export const getAdminReferrals = (
  query: AdminReferralQuery,
  signal?: AbortSignal,
) =>
  adminGet<AdminReferralPage>(
    buildAdminUrl("/api/admin/analytics/referrals", query),
    signal,
  );
export const getAdminReferrers = (
  query: AdminReferrerQuery,
  signal?: AbortSignal,
) =>
  adminGet<AdminReferrerPage>(
    buildAdminUrl("/api/admin/analytics/referrals/referrers", query),
    signal,
  );
export const getAdminReferrerInvites = (
  userId: string,
  query: AdminReferrerInvitesQuery,
  signal?: AbortSignal,
) =>
  adminGet<AdminReferrerInvitesPage>(
    buildAdminUrl(
      `/api/admin/analytics/referrals/referrers/${encodeURIComponent(userId)}/invites`,
      query,
    ),
    signal,
  );
export const queryAdminUsers = (query: AdminUserQuery, signal?: AbortSignal) =>
  adminGet<AdminSafeUsersPage>(
    buildAdminUrl("/api/admin/user/query", query),
    signal,
  );
export const getAdminRetentionOverview = (signal?: AbortSignal) => adminGet<AdminRetentionOverview>("/api/admin/analytics/retention/overview", signal);
export const getAdminRetentionUsers = (query: AdminRetentionUsersQuery, signal?: AbortSignal) => adminGet<AdminRetentionUsersPage>(buildAdminUrl("/api/admin/analytics/retention/users", query), signal);
export const getAdminRetentionCohorts = (months: 6 | 12 | 24, signal?: AbortSignal) => adminGet<AdminRetentionCohorts>(buildAdminUrl("/api/admin/analytics/retention/cohorts", { months }), signal);
export const getAdminUserDetails = (
  userId: string,
  paymentPage = 1,
  paymentPageSize = 25,
  signal?: AbortSignal,
) =>
  adminGet<AdminUserDetails>(
    buildAdminUrl(`/api/admin/user/${encodeURIComponent(userId)}/details`, {
      paymentPage,
      paymentPageSize,
    }),
    signal,
  );

export const deleteAdminUser = (userId: string) =>
  adminDelete<{ ok: true; id: string }>(
    `/api/admin/user/${encodeURIComponent(userId)}`,
  );

export const configureAdminUserSubscription = (
  userId: string,
  planId: string,
) =>
  adminPost(`/api/admin/user/${encodeURIComponent(userId)}/subscription`, {
    planId,
  });

export const stopAdminUserSubscription = (userId: string) =>
  adminPost(
    `/api/admin/user/${encodeURIComponent(userId)}/subscription/stop`,
    {},
  );

export const getAdminUserAccess = (userId: string, signal?: AbortSignal) =>
  adminGet<AdminUserAccessResponse>(
    `/api/admin/user/${encodeURIComponent(userId)}/access`,
    signal,
  );

export const disableAdminUserYooKassaAutoRenew = (userId: string) =>
  adminPost(
    `/api/admin/user/${encodeURIComponent(userId)}/auto-renew/yookassa/disable`,
    {},
  );

export const getAdminUserRecurrent = (userId: string, signal?: AbortSignal) =>
  adminGet<AdminPlategaRecurrentAgreement[]>(
    `/api/admin/user/${encodeURIComponent(userId)}/recurrent`,
    signal,
  );

export const cancelAdminUserRecurrent = (userId: string, agreementId: string) =>
  adminPost(
    `/api/admin/user/${encodeURIComponent(userId)}/recurrent/${encodeURIComponent(agreementId)}/cancel`,
    {},
  );

export const reconcileAdminUserRecurrent = (userId: string, agreementId: string) =>
  adminPost(
    `/api/admin/user/${encodeURIComponent(userId)}/recurrent/${encodeURIComponent(agreementId)}/reconcile`,
    {},
  );

export async function adminPost<TResponse, TData>(url: string, data: TData) {
  const response = await apiClient<TResponse, unknown, TData>({
    method: "POST",
    url,
    data,
  });
  return response.data;
}

export async function adminPostForm<TResponse>(url: string, data: FormData, headers?: HeadersInit) {
  const response = await apiClient<TResponse, unknown, FormData>({
    method: "POST",
    url,
    data,
    headers,
  });
  return response.data;
}

export async function adminPatch<TResponse, TData>(url: string, data: TData) {
  const response = await apiClient<TResponse, unknown, TData>({
    method: "PATCH",
    url,
    data,
  });
  return response.data;
}

export async function adminDelete<TResponse>(url: string) {
  const response = await apiClient<TResponse>({ method: "DELETE", url });
  return response.data;
}
