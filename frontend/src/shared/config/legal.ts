export const LEGAL_DETAILS = {
  serviceName: "NOS VPN",
  operator: "Администрация сервиса NOS VPN",
  telegramSupportUsername: "@your_support_username",
  telegramSupportUrl: "https://t.me/your_support_username",
  effectiveDate: "10 сентября 2026 года",
  version: "2.1",
} as const;

export const SERVICE_LINKS = {
  website: "https://vpn.example.invalid",
  telegramBot: "https://t.me/your_vpn_bot",
} as const;

export const LEGAL_ROUTES = {
  terms: "/terms",
  privacy: "/privacy",
  refund: "/refund",
  contacts: "/contacts",
} as const;

export const LEGAL_LINKS = {
  terms: `${SERVICE_LINKS.website}${LEGAL_ROUTES.terms}`,
  privacy: `${SERVICE_LINKS.website}${LEGAL_ROUTES.privacy}`,
  refund: `${SERVICE_LINKS.website}${LEGAL_ROUTES.refund}`,
  contacts: `${SERVICE_LINKS.website}${LEGAL_ROUTES.contacts}`,
} as const;

export const LEGAL_NAV_LINKS = [
  { href: LEGAL_ROUTES.contacts, label: "Контакты" },
  { href: LEGAL_ROUTES.terms, label: "Условия" },
  { href: LEGAL_ROUTES.privacy, label: "Конфиденциальность" },
  { href: LEGAL_ROUTES.refund, label: "Возвраты" },
] as const;
