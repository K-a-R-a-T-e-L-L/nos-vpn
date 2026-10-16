export type HttpMethod =
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "get"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "GET";

export type RequestConfig<TData = unknown> = {
  baseURL?: string;
  url?: string;
  method: HttpMethod;
  params?: Record<string, unknown>;
  data?: TData | FormData;
  responseType?: "arraybuffer" | "blob" | "document" | "json" | "text" | "stream";
  signal?: AbortSignal;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
};

export type ResponseConfig<TData = unknown> = {
  data: TData;
  status: number;
  statusText: string;
};

export type ResponseErrorConfig<TError = unknown> = {
  data: TError;
  status: number;
  statusText: string;
  headers: Headers;
};

export type Client = <TData = unknown, TError = unknown, TVariables = unknown>(
  config: RequestConfig<TVariables>,
) => Promise<ResponseConfig<TData> & { __errorType?: TError }>;

const ACCESS_TOKEN_STORAGE_KEY = "nos_vpn_access_token";
const AUTH_TOKEN_EVENT = "nos-vpn-auth-token";
const API_PREFIX = "/api";
const REFRESH_URL = `${API_PREFIX}/user/refresh`;

let accessTokenCache: string | null = null;
let refreshPromise: Promise<string> | null = null;

type RefreshTokenResponse = {
  accessToken?: string;
  refreshToken?: string;
};

export function getApiBaseUrl() {
  const baseURL = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!baseURL) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }

  return baseURL;
}

export function getAccessToken() {
  if (accessTokenCache) {
    return accessTokenCache;
  }

  if (typeof window === "undefined") {
    return null;
  }

  accessTokenCache = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  return accessTokenCache;
}

export function setAccessToken(token: string | null) {
  accessTokenCache = token;

  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent(AUTH_TOKEN_EVENT, { detail: { accessToken: token } }));
}

export function subscribeAccessToken(listener: (token: string | null) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ accessToken: string | null }>;
    listener(customEvent.detail.accessToken);
  };

  window.addEventListener(AUTH_TOKEN_EVENT, handler);
  return () => window.removeEventListener(AUTH_TOKEN_EVENT, handler);
}

async function parseResponse<TData, TError>(response: Response) {
  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`) as Error & {
      payload?: TError;
      status?: number;
    };
    error.payload = data as TError;
    error.status = response.status;
    throw error;
  }

  return {
    data: data as TData,
    status: response.status,
    statusText: response.statusText,
  } as ResponseConfig<TData>;
}

export async function refreshAccessTokenPair() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(new URL(REFRESH_URL, normalizedBaseUrl()).toString(), {
        method: "POST",
        credentials: "include",
      });

      const { data } = await parseResponse<RefreshTokenResponse, unknown>(response);

      if (!data.accessToken || !data.refreshToken) {
        setAccessToken(null);
        throw new Error("Refresh response does not contain token pair");
      }

      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch (error) {
      setAccessToken(null);
      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function normalizedBaseUrl(baseURL = getApiBaseUrl()) {
  return baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
}

function normalizeApiPath(rawUrl: string) {
  const value = rawUrl.trim();

  if (!value) {
    return API_PREFIX;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const path = value.startsWith("/") ? value : `/${value}`;

  if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) {
    return path;
  }

  return `${API_PREFIX}${path}`;
}

function buildUrl(config: RequestConfig) {
  const rawUrl = config.url ?? "";
  const url = new URL(normalizeApiPath(rawUrl), normalizedBaseUrl(config.baseURL));

  if (config.params) {
    Object.entries(config.params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.append(key, String(value));
    });
  }

  return url;
}

function buildRequestInit<TVariables>(config: RequestConfig<TVariables>, token: string | null) {
  const headers = new Headers(config.headers ?? {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body: BodyInit | undefined;

  if (config.data instanceof FormData) {
    body = config.data;
  } else if (config.data !== undefined && config.data !== null) {
    body = JSON.stringify(config.data);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  return {
    method: config.method.toUpperCase(),
    body,
    signal: config.signal,
    headers,
    credentials: config.credentials ?? "include",
  } satisfies RequestInit;
}

export default async function client<TData = unknown, TError = unknown, TVariables = unknown>(
  config: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData> & { __errorType?: TError }> {
  const url = buildUrl(config);
  const token = getAccessToken();
  const response = await fetch(url.toString(), buildRequestInit(config, token));

  if (response.status === 401 && normalizeApiPath(config.url ?? "") !== REFRESH_URL) {
    try {
      const refreshedToken = await refreshAccessTokenPair();
      const retryResponse = await fetch(url.toString(), buildRequestInit(config, refreshedToken));
      return (await parseResponse<TData, TError>(retryResponse)) as ResponseConfig<TData> & { __errorType?: TError };
    } catch {
      setAccessToken(null);
    }
  }

  return (await parseResponse<TData, TError>(response)) as ResponseConfig<TData> & { __errorType?: TError };
}

export async function fetchAuthenticatedBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const requestConfig: RequestConfig = { method: "GET", url, signal };
  const resolvedUrl = buildUrl(requestConfig);
  let token = getAccessToken();
  let response = await fetch(resolvedUrl.toString(), buildRequestInit(requestConfig, token));

  if (response.status === 401 && normalizeApiPath(url) !== REFRESH_URL) {
    try {
      token = await refreshAccessTokenPair();
      response = await fetch(resolvedUrl.toString(), buildRequestInit(requestConfig, token));
    } catch {
      setAccessToken(null);
    }
  }

  if (!response.ok) {
    await parseResponse(response);
  }
  return response.blob();
}
