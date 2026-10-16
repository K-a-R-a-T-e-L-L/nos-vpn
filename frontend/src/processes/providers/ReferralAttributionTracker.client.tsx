"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { useAuthSession } from "@/shared/lib/auth/AuthSessionProvider";
import {
  captureTrafficSourceFromSearchParams,
  clearStoredTrafficSource,
  getStoredTrafficSource,
} from "@/shared/lib/attribution/source";
import {
  captureReferralCodeFromSearchParams,
  clearStoredReferralCode,
  getStoredReferralCode,
} from "@/shared/lib/referral/referral";
import { claimReferralCode, claimTrafficSource } from "@/widgets/pages/shared/account/account.client";

export default function ReferralAttributionTracker() {
  const searchParams = useSearchParams();
  const { isAuthenticated, isReady } = useAuthSession();
  const inFlightCodeRef = useRef<string | null>(null);
  const inFlightSourceRef = useRef<string | null>(null);

  useEffect(() => {
    captureReferralCodeFromSearchParams(searchParams);
    captureTrafficSourceFromSearchParams(searchParams);
  }, [searchParams]);

  useEffect(() => {
    if (!isReady || !isAuthenticated) {
      return;
    }

    const referralCode = getStoredReferralCode();
    if (!referralCode || inFlightCodeRef.current === referralCode) {
      return;
    }

    inFlightCodeRef.current = referralCode;

    claimReferralCode(referralCode)
      .then(() => {
        clearStoredReferralCode();
      })
      .catch((error) => {
        const status = (error as { status?: number }).status;
        if (status === 403 || status === 404) {
          clearStoredReferralCode();
        }
        inFlightCodeRef.current = null;
      });
  }, [isAuthenticated, isReady]);

  useEffect(() => {
    if (!isReady || !isAuthenticated) {
      return;
    }

    const sourceCode = getStoredTrafficSource();
    if (!sourceCode || inFlightSourceRef.current === sourceCode) {
      return;
    }

    inFlightSourceRef.current = sourceCode;

    claimTrafficSource(sourceCode, window.location.pathname)
      .then(() => {
        clearStoredTrafficSource();
      })
      .catch((error) => {
        const status = (error as { status?: number }).status;
        if (status === 403 || status === 404) {
          clearStoredTrafficSource();
        }
        inFlightSourceRef.current = null;
      });
  }, [isAuthenticated, isReady]);

  return null;
}
