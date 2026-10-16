import type { ApiPlan, MarketingPlan } from "./plan.types";

function pluralizeDevices(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "устройство";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "устройства";
  }

  return "устройств";
}

function buildPlanSummary(plan: ApiPlan) {
  if (plan.description?.trim()) {
    return plan.description.trim();
  }

  return `${plan.period} дней доступа`;
}

function buildPlanBullets(devicesLabel: string) {
  return [
    `Подключение для ${devicesLabel.toLowerCase()}`,
    "Персональная ссылка доступа и кабинет с инструкциями",
    "Поддержка через сайт и Telegram",
  ];
}

export function mapPlanToMarketingPlan(plan: ApiPlan, index: number): MarketingPlan {
  const title = (plan.title || plan.name || "Тариф").trim();
  const devicesLimit = typeof plan.devicesLimit === "number" ? plan.devicesLimit : null;
  const devicesLabel = devicesLimit
    ? `${devicesLimit} ${pluralizeDevices(devicesLimit)}`
    : "Количество устройств уточняется";

  return {
    id: plan.id,
    code: plan.code || undefined,
    name: plan.name,
    title,
    summary: buildPlanSummary(plan),
    periodDays: plan.period,
    priceRub: plan.amount,
    devicesLimit,
    devicesLabel,
    bullets: buildPlanBullets(devicesLabel),
    popular: index === 1,
  };
}
