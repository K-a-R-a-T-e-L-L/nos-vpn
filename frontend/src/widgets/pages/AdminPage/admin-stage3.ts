export type AdminQueryValue =
  | string
  | number
  | boolean
  | readonly string[]
  | null
  | undefined;
export type AdminQueryRecord = Record<string, AdminQueryValue>;

export function normalizeAdminQuery<T extends object>(
  query: T,
): Record<string, string | number | boolean | readonly string[]> {
  return Object.fromEntries(
    Object.entries(query)
      .filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== "ALL",
      )
      .filter(([, value]) => !Array.isArray(value) || value.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, string | number | boolean | readonly string[]>;
}

export function buildAdminQueryString<T extends object>(query: T) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === "ALL"
    )
      return;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
      return;
    }
    params.set(key, String(value));
  });
  return params.toString();
}

export function buildAdminUrl<T extends object>(path: string, query: T) {
  const serialized = buildAdminQueryString(query);
  return serialized ? `${path}?${serialized}` : path;
}

export function stableAdminQueryKey<T extends object>(scope: string, query: T) {
  return [
    "admin-stage3",
    scope,
    buildAdminQueryString(normalizeAdminQuery(query)),
  ] as const;
}

export function formatAdminMoney(value: string, currency = "RUB") {
  const normalized = String(value || "0.00").replace(/[^\d.-]/g, "");
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholeRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const whole =
    wholeRaw.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ") ||
    "0";
  const fraction = fractionRaw.padEnd(2, "0").slice(0, 2);
  const suffix = currency === "RUB" ? "₽" : currency;
  return `${negative ? "-" : ""}${whole},${fraction} ${suffix}`;
}

const MOSCOW_TIMEZONE = "Europe/Moscow";

export function formatAdminDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatAdminDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export const formatAdminPaymentType = (value?: string | null) =>
  ({
    FIRST_PURCHASE: "Первая покупка",
    MANUAL_RENEWAL: "Ручное продление",
    RECURRENT: "Автосписание",
    BONUS: "Бонус",
    PROMO_DISCOUNT: "Промокод 100%",
  })[value || ""] ||
  value ||
  "—";

export const formatAdminPaymentStatus = (value?: string | null) =>
  ({
    PENDING: "Ожидает",
    SUCCEEDED: "Успешно",
    FAILED: "Ошибка",
    CANCELED: "Отменён",
    EXPIRED: "Истёк",
    REFUNDED: "Возврат",
  })[value || ""] ||
  value ||
  "—";

export const formatAdminActivationStatus = (value?: string | null) =>
  ({
    PENDING: "Ожидает",
    PROCESSING: "В работе",
    SUCCEEDED: "Активировано",
    ACTIVATED: "Активировано",
    FAILED: "Ошибка",
  })[value || ""] ||
  value ||
  "—";

export const formatAdminMerchant = (value?: string | null) =>
  ({ SITE: "Сайт", BOT: "Бот" })[value || ""] || value || "—";
export const formatAdminProvider = (value?: string | null) =>
  ({
    YOOKASSA: "YooKassa",
    PLATEGA: "Platega",
    yookassa: "YooKassa",
    platega: "Platega",
  })[value || ""] ||
  value ||
  "—";

const option = (value: string, label: string) => ({ value, label });

export const ADMIN_PERIOD_OPTIONS = [
  option("TODAY", "Сегодня"),
  option("YESTERDAY", "Вчера"),
  option("LAST_7_DAYS", "Последние 7 дней"),
  option("LAST_30_DAYS", "Последние 30 дней"),
  option("CURRENT_MONTH", "Текущий месяц"),
  option("PREVIOUS_MONTH", "Прошлый месяц"),
  option("CUSTOM", "Свой период"),
];

export const ADMIN_SORT_DIRECTION_OPTIONS = [
  option("DESC", "По убыванию"),
  option("ASC", "По возрастанию"),
];

export const ADMIN_MERCHANT_OPTIONS = [
  option("ALL", "Все"),
  option("SITE", "Сайт"),
  option("BOT", "Бот"),
];

export const ADMIN_PAYMENT_STATUS_OPTIONS = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "EXPIRED",
  "REFUNDED",
].map((value) => option(value, formatAdminPaymentStatus(value)));

export const ADMIN_PAYMENT_TYPE_OPTIONS = [
  option("ALL", "Все"),
  ...[
    "FIRST_PURCHASE",
    "MANUAL_RENEWAL",
    "RECURRENT",
  ].map((value) => option(value, formatAdminPaymentType(value))),
];

export const formatAdminLedgerStatus = (value?: string | null) =>
  ({
    PENDING_WINDOW: "Ожидает начисления",
    CALCULATION_PENDING: "Ожидает расчёта",
    AWARDED: "Начислено",
    REJECTED: "Отклонено",
  })[value || ""] ||
  value ||
  "—";

export const ADMIN_LEDGER_STATUS_OPTIONS = [
  "PENDING_WINDOW",
  "CALCULATION_PENDING",
  "AWARDED",
  "REJECTED",
].map((value) => option(value, formatAdminLedgerStatus(value)));

export const ADMIN_ROLE_OPTIONS = [
  option("USER", "Пользователь"),
  option("MODERATOR", "Модератор"),
  option("ADMIN", "Администратор"),
];
export const formatAdminRole = (value?: string | null) =>
  ADMIN_ROLE_OPTIONS.find((item) => item.value === value)?.label ||
  value ||
  "—";

export const ADMIN_AUTH_CHANNEL_OPTIONS = [
  option("ALL", "Все"),
  option("EMAIL", "Email"),
  option("TELEGRAM", "Telegram"),
  option("BOTH", "Email и Telegram"),
];
export const formatAdminAuthChannel = (value?: string | null) =>
  ADMIN_AUTH_CHANNEL_OPTIONS.find((item) => item.value === value)?.label ||
  value ||
  "—";

export const ADMIN_SUBSCRIPTION_STATE_OPTIONS = [
  option("ALL", "Все"),
  option("ACTIVE", "Активна"),
  option("EXPIRED", "Истекла"),
  option("NONE", "Нет подписки"),
];
export const formatAdminSubscriptionState = (value?: string | null) =>
  ADMIN_SUBSCRIPTION_STATE_OPTIONS.find((item) => item.value === value)
    ?.label ||
  value ||
  "—";

export const formatAdminSubscriptionStatus = (value?: string | null) =>
  ({
    PENDING: "Ожидает",
    TRIAL: "Пробная",
    ACTIVE: "Активна",
    GRACE: "Льготный период",
    EXPIRED: "Истекла",
    CANCELED: "Отменена",
    STOPPED: "Остановлена",
  })[value || ""] ||
  value ||
  "—";

export const ADMIN_USER_PAYMENT_STATE_OPTIONS = [
  option("ALL", "Все"),
  option("EVER_PAID", "Оплачивали"),
  option("NEVER_PAID", "Не оплачивали"),
];

export const ADMIN_REFERRAL_STATE_OPTIONS = [
  option("ALL", "Все"),
  option("IS_REFERRER", "Приглашали пользователей"),
  option("WAS_REFERRED", "Приглашены другим пользователем"),
];

export const formatAdminPromoStatus = (value?: string | null) =>
  ({ ACTIVE: "Активен", INACTIVE: "Неактивен" })[value || ""] || value || "—";

export const formatAdminSupportStatus = (value?: string | null) =>
  ({ OPEN: "Открыто", CLOSED: "Закрыто" })[value || ""] || value || "—";

export function getAdminReferrerScopedMetrics<
  T extends {
    invitedUsers: number;
    payingInvitedUsers: number;
    referredSuccessfulPayments: number;
    referredGrossRevenue: string;
    periodMetrics: {
      invitedUsers: number;
      payingInvitedUsers: number;
      referredSuccessfulPayments: number;
      referredGrossRevenue: string;
    };
  },
>(item: T, scope: "LIFETIME" | "PERIOD") {
  return scope === "PERIOD"
    ? item.periodMetrics
    : {
        invitedUsers: item.invitedUsers,
        payingInvitedUsers: item.payingInvitedUsers,
        referredSuccessfulPayments: item.referredSuccessfulPayments,
        referredGrossRevenue: item.referredGrossRevenue,
      };
}
