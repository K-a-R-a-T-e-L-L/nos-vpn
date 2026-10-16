"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useAdminSupport } from "@/features/admin/support/useAdminSupport";

import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  buildPlanCatalogDraftKey,
  initialPlanCatalogDraft,
  initialPromoForm,
} from "./admin.lib";
import type {
  AdminDashboardSummary,
  AdminPlanCatalog,
  AdminPaginatedResponse,
  PlanCatalogDraftCell,
  PromoCode,
  PromoFormState,
} from "./admin.types";

export type AdminPanelTab =
  | "users"
  | "retention"
  | "finance"
  | "referrals"
  | "plans"
  | "promos"
  | "support";

const LEGACY_STALE_TIME = 30_000;
const LEGACY_GC_TIME = 5 * 60_000;

export function useAdminPanel(activeTab: AdminPanelTab) {
  const queryClient = useQueryClient();
  const support = useAdminSupport(activeTab === "support");
  const [promosPage, setPromosPage] = useState(1);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [savingPromoId, setSavingPromoId] = useState<string | null>(null);
  const [planCatalogDraft, setPlanCatalogDraft] = useState<
    PlanCatalogDraftCell[]
  >(initialPlanCatalogDraft);
  const [promoForm, setPromoForm] = useState<PromoFormState>(initialPromoForm);

  const adminSummaryQuery = useQuery({
    queryKey: ["admin-summary"],
    queryFn: () => adminGet<AdminDashboardSummary>("/api/admin/user/summary"),
    enabled: activeTab === "users",
    staleTime: LEGACY_STALE_TIME,
    gcTime: LEGACY_GC_TIME,
  });
  const promoQuery = useQuery({
    queryKey: ["admin-promo-codes", promosPage],
    queryFn: () =>
      adminGet<AdminPaginatedResponse<PromoCode>>(
        `/api/admin/promo-codes?page=${promosPage}&pageSize=25`,
      ),
    enabled: activeTab === "promos",
    staleTime: LEGACY_STALE_TIME,
    gcTime: LEGACY_GC_TIME,
    placeholderData: keepPreviousData,
  });
  const plansCatalogQuery = useQuery({
    queryKey: ["admin-plans-catalog"],
    queryFn: () => adminGet<AdminPlanCatalog>("/api/admin/plans/catalog"),
    enabled: ["users", "retention", "finance", "referrals", "plans"].includes(activeTab),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const catalogDraftFromQuery = useMemo(() => {
    const catalog = plansCatalogQuery.data;
    if (!catalog) return initialPlanCatalogDraft;
    return catalog.rows.flatMap((row) =>
      catalog.durations.map((duration, periodIndex) => ({
        period: duration.periodDays,
        devicesLimit: row.devicesLimit,
        amount: row.plans[periodIndex]?.amount ?? 0,
        isActive: row.plans[periodIndex]?.isActive ?? false,
      })),
    );
  }, [plansCatalogQuery.data]);
  const effectivePlanCatalogDraft = planCatalogDraft.length
    ? planCatalogDraft
    : catalogDraftFromQuery;

  const savePlanCatalogMutation = useMutation({
    mutationFn: () =>
      adminPost("/api/admin/plans/catalog", {
        plans: effectivePlanCatalogDraft.map((cell) => ({
          period: cell.period,
          devicesLimit: cell.devicesLimit,
          amount: cell.amount,
          isActive: cell.isActive,
        })),
      }),
    onSuccess: () => {
      setPlanCatalogDraft([]);
      queryClient.invalidateQueries({ queryKey: ["admin-plans-catalog"] });
    },
  });

  const createPromoMutation = useMutation({
    mutationFn: () =>
      adminPost<PromoCode, Record<string, unknown>>("/api/admin/promo-codes", {
        code: promoForm.code,
        name: promoForm.name || promoForm.code,
        valuePercent: promoForm.valuePercent,
        maxUses: promoForm.maxUses,
        durationDays: promoForm.durationDays,
        devicesLimit: promoForm.devicesLimit,
        status: promoForm.status,
      }),
    onSuccess: () => {
      setPromoForm(initialPromoForm);
      queryClient.invalidateQueries({ queryKey: ["admin-promo-codes"] });
    },
  });

  const updatePromoMutation = useMutation({
    mutationFn: () =>
      adminPatch<PromoCode, Record<string, unknown>>(
        `/api/admin/promo-codes/${editingPromoId}`,
        {
          code: promoForm.code,
          name: promoForm.name || promoForm.code,
          valuePercent: promoForm.valuePercent,
          maxUses: promoForm.maxUses,
          durationDays: promoForm.durationDays,
          devicesLimit: promoForm.devicesLimit,
          status: promoForm.status,
        },
      ),
    onMutate: () => {
      setSavingPromoId(editingPromoId);
    },
    onSuccess: () => {
      setEditingPromoId(null);
      setPromoForm(initialPromoForm);
      queryClient.invalidateQueries({ queryKey: ["admin-promo-codes"] });
    },
    onSettled: () => setSavingPromoId(null),
  });

  const deletePromoMutation = useMutation({
    mutationFn: (id: string) =>
      adminDelete<{ ok: boolean; id: string }>(`/api/admin/promo-codes/${id}`),
    onSuccess: (_result, deletedPromoId) => {
      if (editingPromoId === deletedPromoId) {
        setEditingPromoId(null);
        setPromoForm(initialPromoForm);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-promo-codes"] });
    },
  });

  const adminSummary = adminSummaryQuery.data || null;
  const plansCatalog = plansCatalogQuery.data || null;
  const promosPageData = promoQuery.data || null;
  const promos = useMemo(() => promosPageData?.items || [], [promosPageData]);

  const metrics = useMemo(
    () => ({
      totalUsers: adminSummary?.totalUsers ?? 0,
      activeSubscriptions: adminSummary?.activeSubscriptions ?? 0,
      activePlans:
        adminSummary?.activePlans ??
        plansCatalog?.rows.reduce(
          (sum, row) => sum + row.plans.filter((plan) => plan?.isActive).length,
          0,
        ) ??
        0,
      activePromos:
        adminSummary?.activePromos ??
        promos.filter(
          (promo) => promo.status === "ACTIVE" && promo.isAvailable !== false,
        ).length,
      openSupportThreads:
        adminSummary?.openSupportThreads ??
        support.supportThreads.filter((thread) => thread.status === "OPEN")
          .length,
    }),
    [adminSummary, plansCatalog, promos, support.supportThreads],
  );

  const activeQueryErrors = [
    activeTab === "users" ? adminSummaryQuery.error : null,
    ["users", "finance", "referrals", "plans"].includes(activeTab)
      ? plansCatalogQuery.error
      : null,
    activeTab === "promos" ? promoQuery.error : null,
    activeTab === "support" ? support.supportThreadsQuery.error : null,
    activeTab === "support" ? support.supportThreadQuery.error : null,
  ];
  const errorList = [
    ...activeQueryErrors,
    savePlanCatalogMutation.error,
    createPromoMutation.error,
    updatePromoMutation.error,
    deletePromoMutation.error,
    support.supportReplyMutation.error,
    support.closeSupportThreadMutation.error,
  ].filter(Boolean);

  const updatePlanDraftCell = (
    period: number,
    devicesLimit: number,
    patch: Partial<PlanCatalogDraftCell>,
  ) => {
    setPlanCatalogDraft((current) =>
      (current.length ? current : catalogDraftFromQuery).map((cell) =>
        buildPlanCatalogDraftKey(cell.period, cell.devicesLimit) ===
        buildPlanCatalogDraftKey(period, devicesLimit)
          ? { ...cell, ...patch }
          : cell,
      ),
    );
  };

  return {
    promosPage,
    setPromosPage,
    supportSearch: support.supportSearch,
    setSupportSearch: support.setSupportSearch,
    supportPage: support.supportPage,
    setSupportPage: support.setSupportPage,
    editingPromoId,
    setEditingPromoId,
    selectedSupportThreadId: support.selectedSupportThreadId,
    setSelectedSupportThreadId: support.setSelectedSupportThreadId,
    supportReplyText: support.supportReplyText,
    supportReplyPhoto: support.supportReplyPhoto,
    supportDeliveryStatus: support.supportDeliveryStatus,
    setSupportReplyText: support.setSupportReplyText,
    setSupportReplyPhoto: support.setSupportReplyPhoto,
    visibleAdminMessages: support.visibleAdminMessages,
    setVisibleAdminMessages: support.setVisibleAdminMessages,
    planCatalogDraft: effectivePlanCatalogDraft,
    setPlanCatalogDraft,
    updatePlanDraftCell,
    promoForm,
    setPromoForm,
    promoQuery,
    plansCatalogQuery,
    adminSummaryQuery,
    supportThreadsQuery: support.supportThreadsQuery,
    supportThreadQuery: support.supportThreadQuery,
    supportReplyMutation: support.supportReplyMutation,
    closeSupportThreadMutation: support.closeSupportThreadMutation,
    savePlanCatalogMutation,
    createPromoMutation,
    updatePromoMutation,
    deletePromoMutation,
    deletingPromoId: deletePromoMutation.isPending
      ? deletePromoMutation.variables || null
      : null,
    savingPromoId,
    adminSummary,
    plansCatalog,
    promos,
    promosPageData,
    supportThreads: support.supportThreads,
    supportThreadsPageData: support.supportThreadsPageData,
    supportMessages: support.supportMessages,
    visibleSupportMessagesSlice: support.visibleSupportMessagesSlice,
    hasMoreSupportMessages: support.hasMoreSupportMessages,
    metrics,
    errorList,
  };
}
