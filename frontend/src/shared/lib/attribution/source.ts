"use client";

const TRAFFIC_SOURCE_STORAGE_KEY = "nos_vpn_traffic_source";

type ReadonlyURLSearchParams = {
  get(name: string): string | null;
};

export function normalizeTrafficSourceCode(value?: string | null) {
  const code = value?.trim().toLowerCase();
  return code ? code : null;
}

export function captureTrafficSourceFromSearchParams(searchParams: URLSearchParams | ReadonlyURLSearchParams) {
  const code =
    normalizeTrafficSourceCode(searchParams.get("src")) ||
    normalizeTrafficSourceCode(searchParams.get("source")) ||
    normalizeTrafficSourceCode(searchParams.get("utm_source"));

  if (!code) {
    return null;
  }

  storeTrafficSource(code);
  return code;
}

export function getStoredTrafficSource() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeTrafficSourceCode(window.localStorage.getItem(TRAFFIC_SOURCE_STORAGE_KEY));
}

export function storeTrafficSource(code: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TRAFFIC_SOURCE_STORAGE_KEY, code);
}

export function clearStoredTrafficSource() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TRAFFIC_SOURCE_STORAGE_KEY);
}
