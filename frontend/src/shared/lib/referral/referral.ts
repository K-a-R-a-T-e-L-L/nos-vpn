"use client";

const REFERRAL_CODE_STORAGE_KEY = "nos_vpn_referral_code";
const WEBSITE_REFERRAL_PATH = "/";

type ReadonlyURLSearchParams = {
  get(name: string): string | null;
};

export function normalizeReferralCode(value?: string | null) {
  const code = value?.trim();
  return code ? code : null;
}

export function captureReferralCodeFromSearchParams(searchParams: URLSearchParams | ReadonlyURLSearchParams) {
  const code =
    normalizeReferralCode(searchParams.get("ref")) ||
    normalizeReferralCode(searchParams.get("referral")) ||
    normalizeReferralCode(searchParams.get("invite"));

  if (!code) {
    return null;
  }

  storeReferralCode(code);
  return code;
}

export function getStoredReferralCode() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeReferralCode(window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY));
}

export function storeReferralCode(code: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, code);
}

export function clearStoredReferralCode() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
}

export function buildWebsiteReferralLink(referralCode: string, origin = window.location.origin) {
  return `${origin}${WEBSITE_REFERRAL_PATH}?ref=${encodeURIComponent(referralCode)}`;
}

export function buildTelegramReferralLink(referralCode: string, telegramBotStartUrl?: string | null) {
  if (!telegramBotStartUrl) {
    return null;
  }

  return `${telegramBotStartUrl}${encodeURIComponent(referralCode)}`;
}

export function buildReferralShareText(input: { websiteLink: string; telegramLink?: string }) {
  const lines = [
    "Я пользуюсь NOS VPN.",
    "Там можно быстро подключить VPN через сайт, а потом при желании привязать Telegram.",
    `Если у тебя не открывается Telegram, просто открой сайт по моей ссылке: ${input.websiteLink}`,
  ];

  if (input.telegramLink) {
    lines.push(`Если Telegram работает, можно просто открыть бота: ${input.telegramLink}`);
  }

  return lines.join("\n");
}
