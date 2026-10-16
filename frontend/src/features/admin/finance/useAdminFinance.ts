"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getAdminMoneyBreakdowns,
  getAdminMoneyOverview,
  getAdminMoneyTimeseries,
  getAdminPayments,
} from "@/widgets/pages/AdminPage/admin.lib";
import {
  ADMIN_PERIOD_OPTIONS,
  stableAdminQueryKey,
} from "@/widgets/pages/AdminPage/admin-stage3";
import type {
  AdminAnalyticsFilters,
  AdminPaymentQuery,
} from "@/widgets/pages/AdminPage/admin.types";
import {
  ADMIN_ANALYTICS_STALE_TIME,
  ADMIN_QUERY_GC_TIME,
} from "@/widgets/pages/AdminPage/components/AdminQueryLoading";

const DEFAULT_FILTERS: AdminAnalyticsFilters = {
  preset: "LAST_30_DAYS",
  provider: "ALL",
  merchant: "ALL",
};

export function useAdminFinance() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetFromUrl = searchParams.get("period");
  const providerFromUrl = searchParams.get("provider");
  const merchantFromUrl = searchParams.get("merchant");
  const initialFilters: AdminAnalyticsFilters = {
    ...DEFAULT_FILTERS,
    ...(ADMIN_PERIOD_OPTIONS.some((option) => option.value === presetFromUrl)
      ? { preset: presetFromUrl as AdminAnalyticsFilters["preset"] }
      : {}),
    ...(searchParams.get("dateFrom")
      ? { dateFrom: searchParams.get("dateFrom")! }
      : {}),
    ...(searchParams.get("dateTo")
      ? { dateTo: searchParams.get("dateTo")! }
      : {}),
    ...(["ALL", "YOOKASSA", "PLATEGA"].includes(providerFromUrl || "")
      ? { provider: providerFromUrl as AdminAnalyticsFilters["provider"] }
      : {}),
    ...(["ALL", "SITE", "BOT"].includes(merchantFromUrl || "")
      ? { merchant: merchantFromUrl as AdminAnalyticsFilters["merchant"] }
      : {}),
  };
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [draft, setDraft] = useState<AdminAnalyticsFilters>(initialFilters);
  const [filters, setFilters] = useState<AdminAnalyticsFilters>(initialFilters);
  const [paymentState, setPaymentState] = useState<
    Pick<
      AdminPaymentQuery,
      "statuses" | "paymentType" | "page" | "pageSize" | "sortBy" | "sortDir"
    >
  >({
    page: Math.max(1, Number(searchParams.get("paymentPage")) || 1),
    pageSize: 25,
    sortBy: (["paidAt", "createdAt", "amount", "status"].includes(
      searchParams.get("paymentSortBy") || "",
    )
      ? searchParams.get("paymentSortBy")
      : "paidAt") as AdminPaymentQuery["sortBy"],
    sortDir: searchParams.get("paymentSortDir") === "ASC" ? "ASC" : "DESC",
    paymentType: "ALL",
  });
  const paymentQuery = {
    ...filters,
    ...paymentState,
  } satisfies AdminPaymentQuery;
  const queryOptions = {
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
    placeholderData: keepPreviousData,
  };
  const overview = useQuery({
    queryKey: stableAdminQueryKey("money-overview", filters),
    queryFn: ({ signal }) => getAdminMoneyOverview(filters, signal),
    ...queryOptions,
  });
  const timeseries = useQuery({
    queryKey: stableAdminQueryKey("money-timeseries", filters),
    queryFn: ({ signal }) => getAdminMoneyTimeseries(filters, signal),
    ...queryOptions,
  });
  const breakdowns = useQuery({
    queryKey: stableAdminQueryKey("money-breakdowns", filters),
    queryFn: ({ signal }) => getAdminMoneyBreakdowns(filters, signal),
    ...queryOptions,
  });
  const payments = useQuery({
    queryKey: stableAdminQueryKey("payments", paymentQuery),
    queryFn: ({ signal }) => getAdminPayments(paymentQuery, signal),
    ...queryOptions,
  });
  const filtersFetching =
    overview.isFetching ||
    timeseries.isFetching ||
    breakdowns.isFetching ||
    payments.isFetching;

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("period", filters.preset || "LAST_30_DAYS");
    if (filters.preset === "CUSTOM" && filters.dateFrom)
      next.set("dateFrom", filters.dateFrom);
    else next.delete("dateFrom");
    if (filters.preset === "CUSTOM" && filters.dateTo)
      next.set("dateTo", filters.dateTo);
    else next.delete("dateTo");
    if (!filters.provider || filters.provider === "ALL")
      next.delete("provider");
    else next.set("provider", filters.provider);
    if (!filters.merchant || filters.merchant === "ALL")
      next.delete("merchant");
    else next.set("merchant", filters.merchant);
    if (paymentState.page === 1) next.delete("paymentPage");
    else next.set("paymentPage", String(paymentState.page));
    if (paymentState.sortBy === "paidAt") next.delete("paymentSortBy");
    else next.set("paymentSortBy", paymentState.sortBy || "paidAt");
    if (paymentState.sortDir === "DESC") next.delete("paymentSortDir");
    else next.set("paymentSortDir", paymentState.sortDir || "DESC");
    const nextUrl = `${pathname}?${next.toString()}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl)
      router.replace(nextUrl, { scroll: false });
  }, [
    filters.dateFrom,
    filters.dateTo,
    filters.merchant,
    filters.preset,
    filters.provider,
    pathname,
    paymentState.page,
    paymentState.sortBy,
    paymentState.sortDir,
    router,
  ]);

  return {
    drawerOpened,
    setDrawerOpened,
    draft,
    setDraft,
    paymentState,
    setPaymentState,
    overview,
    timeseries,
    breakdowns,
    payments,
    filtersFetching,
    apply: () => {
      setFilters(draft);
      setPaymentState((current) => ({ ...current, page: 1 }));
      setDrawerOpened(false);
    },
    reset: () => {
      setDraft(DEFAULT_FILTERS);
      setFilters(DEFAULT_FILTERS);
      setPaymentState((current) => ({
        ...current,
        page: 1,
        statuses: undefined,
        paymentType: "ALL",
      }));
      setDrawerOpened(false);
    },
  };
}
