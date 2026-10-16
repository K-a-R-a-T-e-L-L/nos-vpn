import type { Plan } from "@/shared/api/.generated/types/Plan";
import type { Subscription } from "@/shared/api/.generated/types/Subscription";
import type { UserAccessResponseDto } from "@/shared/api/.generated/types/UserAccessResponseDto";

import type { PaymentActionResponse, PromoPreview } from "./account.types";

const DISPLAY_TIME_ZONE = "Europe/Moscow";

type PlanWithDevices = Plan & {
  devicesLimit?: number | null;
  code?: string | null;
  title?: string | null;
  description?: string | null;
  name: string;
  period: number;
};

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

function getPeriodLabel(period: number) {
  const months = Math.max(1, Math.round(period / 30));

  if (months === 1) {
    return "1 месяц";
  }

  if (months >= 2 && months <= 4) {
    return `${months} месяца`;
  }

  return `${months} месяцев`;
}

function getResolvedDevicesLimit(plan: PlanWithDevices) {
  if (typeof plan.devicesLimit === "number" && plan.devicesLimit > 0) {
    return plan.devicesLimit;
  }

  const legacyByCode: Record<string, number> = {
    vpn_1: 1,
    vpn_2: 2,
    vpn_3: 3,
  };
  const byCode = legacyByCode[String(plan.code || "").trim()];
  if (byCode) {
    return byCode;
  }

  const rawText = `${plan.description || ""} ${plan.title || ""} ${plan.name || ""}`;
  const match = rawText.match(/(\d+)\s+(устройство|устройства|устройств)/i);
  return match ? Number(match[1]) : null;
}

function isLegacyNamedPlan(plan: PlanWithDevices) {
  const code = String(plan.code || "").trim();
  if (code === "vpn_1" || code === "vpn_2" || code === "vpn_3") {
    return true;
  }

  const normalized = `${plan.title || ""} ${plan.name || ""}`.toLowerCase();
  return ["light", "comfort", "premium", "лайт", "комфорт", "премиум"].some(
    (label) => normalized.includes(label),
  );
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Не задано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}

export function getSubscriptionPresentation(
  subscription?: Subscription | null,
  access?: UserAccessResponseDto | null,
) {
  if (!subscription) {
    return {
      statusText: "Подписка не найдена",
      expiresAtLabel: "Не задано",
      expiresAtCaption: "Сейчас активная подписка не найдена.",
      accessTitle: "Ссылка доступа появится после оплаты",
      accessDescription:
        "Выберите тариф, оплатите подписку, и ссылка появится прямо в этом блоке.",
      isExpired: true,
      isGrace: false,
    };
  }

  const now = Date.now();
  const activeEndsAt = subscription.endsAt
    ? new Date(subscription.endsAt).getTime()
    : null;
  const accessDisabledAt = subscription.accessDisabledAt
    ? new Date(subscription.accessDisabledAt).getTime()
    : null;
  const accessExpiresAt = access?.expiresAt
    ? new Date(access.expiresAt).getTime()
    : null;

  if (subscription.status === "GRACE") {
    const expiresAtValue =
      subscription.graceEndsAt ||
      access?.graceEndsAt ||
      access?.expiresAt ||
      null;
    return {
      statusText: "Подписка истекла, но доступ ещё активен 24 часа",
      expiresAtLabel: formatDate(expiresAtValue),
      expiresAtCaption: "Доступ сохранён до конца льготного периода.",
      accessTitle: "Ссылка доступа ещё работает",
      accessDescription:
        "Продлите подписку заранее, пока доступ ещё активен. После окончания льготного периода ссылка отключится.",
      isExpired: false,
      isGrace: true,
    };
  }

  if (subscription.status === "EXPIRED") {
    const anchorTime = accessDisabledAt ?? activeEndsAt ?? accessExpiresAt;
    const daysAgo = anchorTime
      ? Math.max(0, Math.floor((now - anchorTime) / (24 * 60 * 60 * 1000)))
      : null;
    const expiresAtValue =
      subscription.accessDisabledAt ||
      subscription.endsAt ||
      access?.expiresAt ||
      null;
    const suffix =
      daysAgo === null
        ? "Подписка истекла."
        : daysAgo === 0
          ? "Подписка истекла сегодня."
          : `Подписка истекла ${daysAgo} дн. назад.`;

    return {
      statusText: "Подписка истекла",
      expiresAtLabel: formatDate(expiresAtValue),
      expiresAtCaption: suffix,
      accessTitle: "Доступ отключён",
      accessDescription:
        "Продлите подписку, и ссылка доступа снова появится в кабинете. Ваш аккаунт и история сохранятся.",
      isExpired: true,
      isGrace: false,
    };
  }

  return {
    statusText: "Доступ активен",
    expiresAtLabel: formatDate(
      subscription.endsAt || access?.expiresAt || subscription.nextPayAt,
    ),
    expiresAtCaption: "Подписка работает в обычном режиме.",
    accessTitle: "Ссылка доступа готова",
    accessDescription:
      "Откройте ссылку или QR-код и подключите устройство. Если нужен другой тариф, его можно сменить без создания нового аккаунта.",
    isExpired: false,
    isGrace: false,
  };
}

export function getPlanTitle(plan: PlanWithDevices) {
  const devicesLimit = getResolvedDevicesLimit(plan);
  const explicitTitle = (plan.title || "").trim();
  const explicitName = (plan.name || "").trim();

  if (explicitTitle && !isLegacyNamedPlan(plan)) {
    return explicitTitle;
  }

  if (
    explicitName &&
    !isLegacyNamedPlan(plan) &&
    !/\d+\s+(устройство|устройства|устройств)/i.test(explicitName)
  ) {
    return explicitName;
  }

  if (devicesLimit) {
    return `${devicesLimit} ${pluralizeDevices(devicesLimit)} · ${getPeriodLabel(plan.period)}`;
  }

  return explicitTitle || explicitName || getPeriodLabel(plan.period);
}

export function getPlanDescription(plan: PlanWithDevices) {
  if (plan.description?.trim()) {
    return plan.description;
  }

  const devicesLimit = getResolvedDevicesLimit(plan);
  if (devicesLimit) {
    return `${devicesLimit} ${pluralizeDevices(devicesLimit)}`;
  }

  return `${plan.period} дней доступа`;
}

export function getPlanDevices(plan: PlanWithDevices) {
  const devicesLimit = getResolvedDevicesLimit(plan);
  if (devicesLimit) {
    return `${devicesLimit} ${pluralizeDevices(devicesLimit)}`;
  }

  const match = getPlanDescription(plan).match(
    /\d+\s+(устройство|устройства|устройств)/i,
  );
  return match?.[0] ?? getPlanDescription(plan);
}

export function formatPrice(plan: Plan) {
  return `${plan.amount} ₽`;
}

export function getEffectivePromoDurationDays(
  plan: Plan,
  promo?: PromoPreview | null,
) {
  return promo && Number(promo.durationDays) > 0
    ? promo.durationDays
    : plan.period;
}

export function getEffectivePromoDevicesLabel(
  plan: PlanWithDevices,
  promo?: PromoPreview | null,
) {
  if (promo && Number(promo.devicesLimit) > 0) {
    return `${promo.devicesLimit} ${pluralizeDevices(promo.devicesLimit)}`;
  }

  return getPlanDevices(plan);
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const payload = (
      error as Error & {
        payload?: {
          message?: string | string[];
          description?: string;
          error?: string;
        };
        status?: number;
      }
    ).payload;
    const rawMessage = Array.isArray(payload?.message)
      ? payload.message.join(", ")
      : payload?.message;
    const message =
      rawMessage || payload?.description || payload?.error || error.message;
    const normalizedDetails =
      `${rawMessage || ""} ${payload?.description || ""} ${payload?.error || ""} ${error.message || ""}`
        .toLowerCase()
        .trim();

    if (
      message === "Failed to fetch" ||
      normalizedDetails.includes("failed to fetch")
    ) {
      return "Не удалось подключиться к серверу. Проверьте интернет или попробуйте позже.";
    }

    if (message === "AUTH_FAIL") {
      return "Неверный логин или пароль.";
    }

    if (message === "ENTITY_NOT_FOUND") {
      return "Данные не найдены. Проверьте введённую информацию или обратитесь в поддержку.";
    }

    if (message === "ENTITY_CREATION_FAIL") {
      return "Не удалось создать запись. Возможно, такие данные уже используются.";
    }

    if (normalizedDetails.includes("promo code already used")) {
      return "Этот промокод уже был использован в вашем аккаунте.";
    }

    if (normalizedDetails.includes("promo code usage limit reached")) {
      return "Лимит использований этого промокода уже исчерпан.";
    }

    if (normalizedDetails.includes("promo code is inactive or expired")) {
      return "Промокод больше не действует. Проверьте код или используйте другой.";
    }

    if (normalizedDetails.includes("request failed with status")) {
      return "Сервер временно не смог обработать запрос. Попробуйте ещё раз.";
    }

    if (payload?.description) {
      return payload.description;
    }

    return message || "Не удалось выполнить запрос.";
  }

  return "Не удалось выполнить запрос.";
}

export function extractPaymentUrl(response: unknown) {
  const payload = response as PaymentActionResponse | null;
  return (
    payload?.redirectUrl ||
    payload?.paymentUrl ||
    payload?.paymentLink ||
    payload?.confirmationUrl ||
    payload?.confirmation?.confirmation_url ||
    payload?.confirmation?.confirmationUrl ||
    payload?.url ||
    null
  );
}

export function getAuthErrorMessage(
  error: unknown,
  mode: "login" | "register",
) {
  if (!(error instanceof Error)) {
    return "Не удалось выполнить действие. Попробуйте ещё раз.";
  }

  const payload = (
    error as Error & {
      payload?: {
        message?: string | string[];
        description?: string;
        error?: string;
      };
      status?: number;
    }
  ).payload;
  const message = Array.isArray(payload?.message)
    ? payload.message.join(", ")
    : payload?.message;
  const description = payload?.description || "";

  if (error.message === "Failed to fetch") {
    return "Не удалось подключиться к серверу. Проверьте интернет или попробуйте позже.";
  }

  if (mode === "login" && message === "ENTITY_NOT_FOUND") {
    return "Аккаунт с такой почтой не найден. Проверьте email или создайте новый аккаунт.";
  }

  if (mode === "login" && message === "AUTH_FAIL") {
    return "Неверный логин или пароль.";
  }

  if (
    mode === "register" &&
    message === "ENTITY_CREATION_FAIL" &&
    description.toLowerCase().includes("email")
  ) {
    return "Аккаунт с такой почтой уже создан. Войдите в аккаунт или используйте другую почту.";
  }

  if (mode === "register" && message === "ENTITY_CREATION_FAIL") {
    return "Не удалось создать аккаунт. Если эта почта уже используется, войдите по email и паролю.";
  }

  return getErrorMessage(error);
}
