"use client";

import { useEffect, useState } from "react";

import { getAutoRenewState, syncPaymentStatus } from "@/widgets/pages/shared/account/account.api";

import PaymentStatusPageView from "./PaymentStatusPage";

type PaymentStatus = "success" | "activation" | "pending" | "fail" | "unknown" | "retry";

type PaymentStatusAutoSyncProps = {
  paymentId: string;
  initialStatus: PaymentStatus;
};

function mapBackendStatus(result: Awaited<ReturnType<typeof syncPaymentStatus>>): PaymentStatus | null {
  const normalized = String(result?.status || "").toUpperCase();
  const activation = String(result?.activationStatus || "").toUpperCase();
  if (String(result?.externalStatus || "").toLowerCase().includes("outcome_unknown")) return "unknown";

  if (normalized === "SUCCEEDED") {
    return activation === "SUCCEEDED" || result?.subscriptionStatus === "ACTIVE" ? "success" : "activation";
  }

  if (normalized === "PENDING") {
    return result?.message === "status_check_failed" ? "retry" : "pending";
  }

  if (normalized === "FAILED" || normalized === "CANCELED" || normalized === "EXPIRED" || normalized === "REFUNDED") {
    return "fail";
  }

  return null;
}

export default function PaymentStatusAutoSync({ paymentId, initialStatus }: PaymentStatusAutoSyncProps) {
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const [autoRenewEnabled, setAutoRenewEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: number | undefined;

    async function run() {
      try {
        const result = await syncPaymentStatus(paymentId);
        if (cancelled) {
          return;
        }

        const nextStatus = mapBackendStatus(result);
        if (nextStatus) {
          setStatus(nextStatus);
        }
        if (nextStatus === "success") {
          try {
            const autoRenew = await getAutoRenewState();
            if (!cancelled) setAutoRenewEnabled(Boolean(autoRenew.enabled));
          } catch {
            // Payment success remains authoritative if the optional status refresh is temporarily unavailable.
          }
        }
        if (nextStatus === "success" || nextStatus === "fail" || Date.now() - startedAt >= 10 * 60_000) return;
      } catch {
        if (!cancelled) setStatus("retry");
      }
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      const delay = elapsed < 20_000 ? 2_000 : elapsed < 2 * 60_000 ? 5_000 : 15_000;
      timer = window.setTimeout(() => void run(), delay);
    }

    void run();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [initialStatus, paymentId]);

  return <PaymentStatusPageView status={status} autoRenewEnabled={autoRenewEnabled} />;
}
