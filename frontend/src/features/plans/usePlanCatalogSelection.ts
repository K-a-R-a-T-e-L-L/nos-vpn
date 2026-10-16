"use client";

import { useMemo, useState } from "react";

import type { PlanCatalogResponse } from "@/widgets/pages/shared/plans/plan.types";
import { getRecommendedDevices, getSelectedPlan } from "./plan-selection";

export function usePlanCatalogSelection(catalog: PlanCatalogResponse) {
  const [selectedPeriod, setSelectedPeriod] = useState(
    catalog.durations[0]?.periodDays ?? 30,
  );
  const [selectedDevices, setSelectedDevices] = useState<number | null>(() =>
    getRecommendedDevices(catalog),
  );
  const selectedDuration = useMemo(
    () =>
      catalog.durations.find(
        (duration) => duration.periodDays === selectedPeriod,
      ) ?? null,
    [catalog.durations, selectedPeriod],
  );
  const selectedRow = useMemo(
    () =>
      catalog.rows.find((row) => row.devicesLimit === selectedDevices) ?? null,
    [catalog.rows, selectedDevices],
  );
  const selectedPlan = useMemo(
    () => getSelectedPlan(catalog, selectedPeriod, selectedDevices),
    [catalog, selectedDevices, selectedPeriod],
  );

  return {
    selectedPeriod,
    selectedDevices,
    selectedDuration,
    selectedRow,
    selectedPlan,
    setSelectedPeriod,
    setSelectedDevices,
  };
}
