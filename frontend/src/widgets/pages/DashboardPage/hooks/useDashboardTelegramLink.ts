"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { userControllerCreateTelegramLink } from "@/shared/api/.generated/clients/userController/userControllerCreateTelegramLink";

const TELEGRAM_LINK_REFRESH_BUFFER_MS = 15_000;

export type PreparedTelegramLink = { linkUrl: string; expiresAt: number };

export function useDashboardTelegramLink(isVisible: boolean) {
  const query = useQuery({
    queryKey: ["telegram-link"],
    queryFn: async () => {
      const response = await userControllerCreateTelegramLink();
      return {
        linkUrl: response.linkUrl,
        expiresAt: new Date(response.expiresAt).getTime(),
      } satisfies PreparedTelegramLink;
    },
    enabled: isVisible,
    staleTime: TELEGRAM_LINK_REFRESH_BUFFER_MS,
    refetchInterval: (state) => {
      const prepared = state.state.data;
      if (!prepared) return false;
      return Math.max(
        5_000,
        prepared.expiresAt - Date.now() - TELEGRAM_LINK_REFRESH_BUFFER_MS,
      );
    },
  });

  const getPreparedLink = useCallback(async () => {
    const prepared = query.data;
    if (
      prepared &&
      prepared.expiresAt > Date.now() + TELEGRAM_LINK_REFRESH_BUFFER_MS
    )
      return prepared;
    return (await query.refetch()).data ?? null;
  }, [query]);

  return {
    isPreparing: isVisible && query.isFetching,
    prepareError: isVisible ? query.error : null,
    getPreparedLink,
  };
}
