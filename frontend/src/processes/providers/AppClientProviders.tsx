"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

import { AuthSessionProvider } from "@/shared/lib/auth/AuthSessionProvider";
import ReferralAttributionTracker from "./ReferralAttributionTracker.client";

export default function AppClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider>
        <ReferralAttributionTracker />
        {children}
      </AuthSessionProvider>
    </QueryClientProvider>
  );
}
