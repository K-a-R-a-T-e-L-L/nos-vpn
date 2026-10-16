import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getApiBaseUrl } from "@/shared/api/client";

type ServerAuthUser = {
  id: string;
  email?: string;
  telegramId?: number;
  telegramUsername?: string;
  role?: string;
};

type RefreshResponse = {
  accessToken?: string;
};

function buildApiUrl(path: string) {
  const baseUrl = getApiBaseUrl();
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalizedBaseUrl).toString();
}

export async function getServerAuthUser(): Promise<ServerAuthUser | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    return null;
  }

  const cookieHeader = cookieStore.toString();
  try {
    const refreshResponse = await fetch(buildApiUrl("/api/user/refresh"), {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!refreshResponse.ok) {
      return null;
    }

    const refreshPayload = (await refreshResponse.json()) as RefreshResponse;
    if (!refreshPayload.accessToken) {
      return null;
    }

    const userResponse = await fetch(buildApiUrl("/api/user"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${refreshPayload.accessToken}`,
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      return null;
    }

    return (await userResponse.json()) as ServerAuthUser;
  } catch {
    return null;
  }
}

export async function requireAdminUser() {
  const user = await getServerAuthUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  return user;
}
