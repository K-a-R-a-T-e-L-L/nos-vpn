"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  adminGet,
  adminPatch,
  adminPost,
  adminPostForm,
  SUPPORT_MESSAGES_PAGE_SIZE,
} from "@/widgets/pages/AdminPage/admin.lib";
import type {
  AdminPaginatedResponse,
  AdminSupportReplyResult,
  SupportDeliveryStatus,
  SupportThreadDetail,
  SupportThreadSummary,
} from "@/widgets/pages/AdminPage/admin.types";

const STALE_TIME = 30_000;
const GC_TIME = 5 * 60_000;

export function useAdminSupport(enabled: boolean) {
  const queryClient = useQueryClient();
  const [supportSearch, setSupportSearchState] = useState("");
  const [supportPage, setSupportPage] = useState(1);
  const [selectedSupportThreadIdState, setSelectedSupportThreadIdState] =
    useState<string | null>(null);
  const [supportReplyText, setSupportReplyText] = useState("");
  const [supportReplyPhoto, setSupportReplyPhoto] = useState<File | null>(null);
  const [supportReplyPhotoRequestId, setSupportReplyPhotoRequestId] = useState<string | null>(null);
  const [supportDeliveryStatus, setSupportDeliveryStatus] = useState<SupportDeliveryStatus | null>(null);
  const [visibleAdminMessages, setVisibleAdminMessages] = useState(
    SUPPORT_MESSAGES_PAGE_SIZE,
  );

  const supportThreadsQuery = useQuery({
    queryKey: ["admin-support-threads", supportSearch, supportPage],
    queryFn: () =>
      adminGet<AdminPaginatedResponse<SupportThreadSummary>>(
        `/api/admin/support/threads?page=${supportPage}&pageSize=20${supportSearch ? `&search=${encodeURIComponent(supportSearch)}` : ""}`,
      ),
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: keepPreviousData,
  });
  const selectedSupportThreadId =
    selectedSupportThreadIdState ||
    supportThreadsQuery.data?.items[0]?.id ||
    null;
  const supportThreadQuery = useQuery({
    queryKey: ["admin-support-thread", selectedSupportThreadId],
    queryFn: () =>
      adminGet<SupportThreadDetail>(
        `/api/admin/support/threads/${selectedSupportThreadId}`,
      ),
    enabled: enabled && Boolean(selectedSupportThreadId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const supportReplyMutation = useMutation({
    mutationFn: ({ threadId, text, photo }: { threadId: string; text: string; photo: File | null }) => {
      if (!photo) {
        return adminPost<AdminSupportReplyResult, { text: string }>(
          `/api/admin/support/threads/${threadId}/reply`,
          { text },
        );
      }
      const form = new FormData();
      form.set("image", photo);
      if (text.trim()) form.set("text", text.trim());
      if (!supportReplyPhotoRequestId) throw new Error("Не удалось подготовить повторную отправку изображения");
      return adminPostForm<AdminSupportReplyResult>(`/api/admin/support/threads/${threadId}/reply/photo`, form, { "Idempotency-Key": supportReplyPhotoRequestId });
    },
    onSuccess: (result, variables) => {
      setSupportReplyText("");
      setSupportReplyPhoto(null);
      setSupportReplyPhotoRequestId(null);
      setSupportDeliveryStatus(result.delivery);
      queryClient.invalidateQueries({ queryKey: ["admin-support-threads"] });
      queryClient.invalidateQueries({
        queryKey: ["admin-support-thread", variables.threadId],
      });
    },
    onMutate: () => {
      setSupportDeliveryStatus(null);
    },
  });
  const closeSupportThreadMutation = useMutation({
    mutationFn: (threadId: string) =>
      adminPatch<SupportThreadDetail, Record<string, never>>(
        `/api/admin/support/threads/${threadId}/close`,
        {},
      ),
    onSuccess: (_, threadId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-threads"] });
      queryClient.invalidateQueries({
        queryKey: ["admin-support-thread", threadId],
      });
    },
  });

  const supportThreadsPageData = supportThreadsQuery.data || null;
  const supportThreads = useMemo(
    () => supportThreadsPageData?.items || [],
    [supportThreadsPageData],
  );
  const supportMessages = supportThreadQuery.data?.messages || [];

  return {
    supportSearch,
    setSupportSearch: (value: string) => {
      setSupportSearchState(value);
      setSupportPage(1);
    },
    supportPage,
    setSupportPage,
    selectedSupportThreadId,
    setSelectedSupportThreadId: (value: string | null) => {
      setSelectedSupportThreadIdState(value);
      setSupportDeliveryStatus(null);
      setSupportReplyPhoto(null);
      setSupportReplyPhotoRequestId(null);
      setVisibleAdminMessages(SUPPORT_MESSAGES_PAGE_SIZE);
    },
    supportReplyText,
    supportReplyPhoto,
    supportReplyPhotoRequestId,
    supportDeliveryStatus,
    setSupportReplyText,
    setSupportReplyPhoto: (file: File | null) => {
      setSupportReplyPhoto(file);
      setSupportReplyPhotoRequestId(file ? globalThis.crypto.randomUUID() : null);
    },
    visibleAdminMessages,
    setVisibleAdminMessages,
    supportThreadsQuery,
    supportThreadQuery,
    supportReplyMutation,
    closeSupportThreadMutation,
    supportThreads,
    supportThreadsPageData,
    supportMessages,
    visibleSupportMessagesSlice: supportMessages.slice(-visibleAdminMessages),
    hasMoreSupportMessages: supportMessages.length > visibleAdminMessages,
  };
}
