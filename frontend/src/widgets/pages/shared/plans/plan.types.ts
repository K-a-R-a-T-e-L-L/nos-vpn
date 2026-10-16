import type { Plan as GeneratedPlan } from "@/shared/api/.generated/types/Plan";

export type ApiPlan = GeneratedPlan & {
  devicesLimit?: number | null;
};

export type PlanCatalogCell = {
  id: string;
  code?: string | null;
  title?: string | null;
  name: string;
  description?: string | null;
  period: number;
  amount: number;
  isActive: boolean;
  devicesLimit: number;
  savingsPercent: number | null;
};

export type PlanCatalogDuration = {
  periodDays: number;
  months: number;
  label: string;
  startingPriceRub: number;
  savingsPercent: number | null;
};

export type PlanCatalogRow = {
  devicesLimit: number;
  devicesLabel: string;
  plans: Array<PlanCatalogCell | null>;
};

export type PlanCatalogResponse = {
  durations: PlanCatalogDuration[];
  rows: PlanCatalogRow[];
};

export type MarketingPlan = {
  id: string;
  code?: string;
  name: string;
  title: string;
  summary: string;
  periodDays: number;
  priceRub: number;
  devicesLimit: number | null;
  devicesLabel: string;
  bullets: string[];
  popular?: boolean;
};
