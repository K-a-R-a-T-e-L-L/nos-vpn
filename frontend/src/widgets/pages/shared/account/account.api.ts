"use client";

import apiClient from "@/shared/api/client";

import type { AutoRenewState, DashboardUser, PaymentStatusResponse, PromoPreview, ReferralStats, StoredTelegramAuthRequest, SupportThread, TelegramAuthLinkResponse, TelegramAuthStatusResponse } from "./account.types";
import { TELEGRAM_AUTH_STORAGE_KEY } from "./account.types";

export async function createTelegramAuthLink() {
  const response = await apiClient<TelegramAuthLinkResponse>({
    method: "POST",
    url: "/api/user/telegram-auth-link",
  });
  return response.data;
}

export async function completeTelegramAuth(requestToken: string) {
  const response = await apiClient<TelegramAuthStatusResponse, unknown, { requestToken: string }>({
    method: "POST",
    url: "/api/user/telegram-auth-status",
    data: { requestToken },
  });
  return response.data;
}

export async function attachEmailPassword(data: { email: string; password: string }) {
  const response = await apiClient({
    method: "POST",
    url: "/api/user/email-password",
    data,
  });
  return response.data;
}

export async function logoutUser() {
  const response = await apiClient<{ ok: boolean }>({
    method: "POST",
    url: "/api/user/logout",
  });
  return response.data;
}

export async function consumeTelegramLinkCode(data: { code: string }) {
  const response = await apiClient<DashboardUser, unknown, { code: string }>({
    method: "POST",
    url: "/api/user/telegram-link-code/consume",
    data,
  });
  return response.data;
}

export async function getSupportThread() {
  const response = await apiClient<SupportThread | null>({
    method: "GET",
    url: "/api/support/me",
  });
  return response.data;
}

export async function createSupportMessage(data: { text: string }) {
  const response = await apiClient<SupportThread, unknown, { text: string }>({
    method: "POST",
    url: "/api/support/message",
    data,
  });
  return response.data;
}

export async function createSupportPhotoMessage(data: { image: File; text?: string; idempotencyKey: string }) {
  const form = new FormData();
  form.set("image", data.image);
  if (data.text?.trim()) form.set("text", data.text.trim());
  const response = await apiClient<{ thread: SupportThread; notification: "SENT" | "PARTIAL" | "FAILED" | "SKIPPED_DUPLICATE" }, unknown, FormData>({
    method: "POST",
    url: "/api/support/message/photo",
    data: form,
    headers: { "Idempotency-Key": data.idempotencyKey },
  });
  return response.data;
}

export async function validatePromoCode(data: { code: string; planId?: string }) {
  const response = await apiClient<PromoPreview, unknown, typeof data>({
    method: "POST",
    url: "/api/promo-codes/validate",
    data,
  });
  return response.data;
}

export async function getReferralStats() {
  const response = await apiClient<ReferralStats>({
    method: "GET",
    url: "/api/user/referral",
  });
  return response.data;
}

export async function claimReferralCode(referralCode: string) {
  const response = await apiClient<ReferralStats, unknown, { referralCode: string }>({
    method: "POST",
    url: "/api/user/referral/attach",
    data: { referralCode },
  });
  return response.data;
}

export async function claimTrafficSource(sourceCode: string, landingPath?: string | null) {
  const response = await apiClient({
    method: "POST",
    url: "/api/user/attribution/claim",
    data: {
      sourceCode,
      landingPath: landingPath || null,
    },
  });
  return response.data;
}

export async function syncPaymentStatus(paymentId: string) {
  const response = await apiClient<PaymentStatusResponse>({
    method: "GET",
    url: `/api/payments/${paymentId}/status`,
  });

  return response.data;
}

export async function getAutoRenewState() {
  return (await apiClient<AutoRenewState>({ method: "GET", url: "/api/user/subscription/auto-renew" })).data;
}

export async function enableAutoRenew() {
  return (await apiClient<AutoRenewState>({ method: "POST", url: "/api/user/subscription/auto-renew/enable" })).data;
}

export async function disableAutoRenew() {
  return (await apiClient<AutoRenewState>({ method: "POST", url: "/api/user/subscription/auto-renew/disable" })).data;
}

function shouldOpenTelegramInCurrentTab() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(userAgent);
}

export function openTelegramUrl(url: string, target: "new-tab" | "current" = "new-tab") {
  if (window.Telegram?.WebApp?.openTelegramLink) {
    window.Telegram.WebApp.openTelegramLink(url);
    return;
  }

  if (target === "current" || shouldOpenTelegramInCurrentTab()) {
    window.location.href = url;
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function readStoredTelegramAuthRequest() {
  try {
    const raw = window.sessionStorage.getItem(TELEGRAM_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredTelegramAuthRequest;
    if (!parsed.requestToken || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(TELEGRAM_AUTH_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(TELEGRAM_AUTH_STORAGE_KEY);
    return null;
  }
}

export function writeStoredTelegramAuthRequest(requestToken: string, expiresAt: number) {
  window.sessionStorage.setItem(TELEGRAM_AUTH_STORAGE_KEY, JSON.stringify({ requestToken, expiresAt }));
}

export function sanitizeNextPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}
