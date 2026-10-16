"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { AdminPanelTab } from "../useAdminPanel";

const allowedTabs: readonly AdminPanelTab[] = [
  "users",
  "retention",
  "finance",
  "referrals",
  "plans",
  "promos",
  "support",
];

function readAdminTab(value: string | null): AdminPanelTab {
  return allowedTabs.includes(value as AdminPanelTab)
    ? (value as AdminPanelTab)
    : "users";
}

export function useAdminTabRouting() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = readAdminTab(searchParams.get("tab"));
  const [activeTab, setActiveTabState] = useState<AdminPanelTab>(
    () => requestedTab,
  );
  const pendingTabRef = useRef<AdminPanelTab | null>(null);

  useEffect(() => {
    if (pendingTabRef.current) {
      if (pendingTabRef.current === requestedTab) pendingTabRef.current = null;
      return;
    }
    // Browser history is an external source; this is intentional synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTabState(requestedTab);
  }, [requestedTab]);

  const setActiveTab = (value: string | null) => {
    if (!value || !allowedTabs.includes(value as AdminPanelTab)) return;
    const nextTab = value as AdminPanelTab;
    pendingTabRef.current = nextTab;
    setActiveTabState(nextTab);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", nextTab);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return { activeTab, setActiveTab };
}
