import type {
  PlanCatalogCell,
  PlanCatalogResponse,
} from "@/widgets/pages/shared/plans/plan.types";

export function formatPlanPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function getRecommendedDevices(catalog: PlanCatalogResponse) {
  return (
    catalog.rows.find((row) => row.devicesLimit === 2)?.devicesLimit ??
    catalog.rows[0]?.devicesLimit ??
    null
  );
}

export function getSelectedPlan(
  catalog: PlanCatalogResponse,
  periodDays: number,
  devicesLimit: number | null,
): PlanCatalogCell | null {
  const row = catalog.rows.find(
    (candidate) => candidate.devicesLimit === devicesLimit,
  );
  const periodIndex = catalog.durations.findIndex(
    (duration) => duration.periodDays === periodDays,
  );
  return row && periodIndex >= 0 ? (row.plans[periodIndex] ?? null) : null;
}
