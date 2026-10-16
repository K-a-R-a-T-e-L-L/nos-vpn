"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  getAdminReferralOverview,
  getAdminReferrers,
} from "@/widgets/pages/AdminPage/admin.lib";
import { stableAdminQueryKey } from "@/widgets/pages/AdminPage/admin-stage3";
import type {
  AdminReferralQuery,
  AdminReferrerQuery,
} from "@/widgets/pages/AdminPage/admin.types";
import {
  ADMIN_ANALYTICS_STALE_TIME,
  ADMIN_QUERY_GC_TIME,
} from "@/widgets/pages/AdminPage/components/AdminQueryLoading";

const OVERVIEW_DEFAULTS: AdminReferralQuery = {
  preset: "LAST_30_DAYS",
  merchant: "ALL",
  page: 1,
  pageSize: 25,
  sortBy: "registeredAt",
  sortDir: "DESC",
};
const REFERRER_DEFAULTS: AdminReferrerQuery = {
  preset: "LAST_30_DAYS",
  onlyWithInvited: true,
  metricScope: "LIFETIME",
  page: 1,
  pageSize: 25,
  sortBy: "invitedUsers",
  sortDir: "DESC",
};

export function useAdminReferrals() {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<AdminReferralQuery>(OVERVIEW_DEFAULTS);
  const [overviewQuery, setOverviewQuery] =
    useState<AdminReferralQuery>(OVERVIEW_DEFAULTS);
  const [referrerQuery, setReferrerQuery] =
    useState<AdminReferrerQuery>(REFERRER_DEFAULTS);
  const [selectedReferrerId, setSelectedReferrerId] = useState<string | null>(
    null,
  );
  const overviewFilters = {
    ...overviewQuery,
    page: undefined,
    pageSize: undefined,
    sortBy: undefined,
    sortDir: undefined,
  };
  const overview = useQuery({
    queryKey: stableAdminQueryKey("referral-overview", overviewFilters),
    queryFn: ({ signal }) => getAdminReferralOverview(overviewFilters, signal),
    placeholderData: keepPreviousData,
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
  });
  const referrers = useQuery({
    queryKey: stableAdminQueryKey("referrers", referrerQuery),
    queryFn: ({ signal }) => getAdminReferrers(referrerQuery, signal),
    placeholderData: keepPreviousData,
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
  });
  const applying = overview.isFetching || referrers.isFetching;

  return {
    opened,
    setOpened,
    draft,
    setDraft,
    referrerQuery,
    setReferrerQuery,
    selectedReferrerId,
    setSelectedReferrerId,
    overview,
    referrers,
    applying,
    apply: () => {
      setOverviewQuery({ ...draft, page: 1 });
      setReferrerQuery((current) => ({
        ...current,
        preset: draft.preset,
        dateFrom: draft.dateFrom,
        dateTo: draft.dateTo,
        referrerSearch: draft.referrerSearch,
        page: 1,
      }));
      setOpened(false);
    },
    reset: () => {
      setDraft(OVERVIEW_DEFAULTS);
      setOverviewQuery(OVERVIEW_DEFAULTS);
      setReferrerQuery(REFERRER_DEFAULTS);
      setOpened(false);
    },
  };
}
