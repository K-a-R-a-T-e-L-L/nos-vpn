import "server-only";

import { getApiBaseUrl } from "@/shared/api/client";

import { mapPlanToMarketingPlan } from "./plan.mapper";
import type { ApiPlan, MarketingPlan, PlanCatalogResponse } from "./plan.types";

function normalizeBaseUrl(baseUrl = getApiBaseUrl()) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, normalizeBaseUrl()).toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getPublicPlansCatalog() {
  return fetchJson<PlanCatalogResponse>("api/plans/catalog");
}

export async function getPublicMarketingPlans(): Promise<MarketingPlan[]> {
  const payload = await fetchJson<{ data: ApiPlan[] }>("api/plans?limit=120");

  return payload.data
    .filter((plan) => plan.isActive)
    .sort((left, right) => left.amount - right.amount)
    .map((plan, index) => mapPlanToMarketingPlan(plan, index));
}
