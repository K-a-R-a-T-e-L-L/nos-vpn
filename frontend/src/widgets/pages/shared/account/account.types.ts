import { IconShieldCheck, IconSparkles, IconStar } from "@tabler/icons-react";
import type { User as ApiUser } from "@/shared/api/.generated/types/User";

export type PaymentActionResponse = {
  paymentUrl?: string;
  paymentLink?: string;
  confirmationUrl?: string;
  redirectUrl?: string;
  paidWithPromo?: boolean;
  status?: string;
  confirmation?: {
    confirmation_url?: string;
    confirmationUrl?: string;
  };
  url?: string;
};

export type PaymentStatusResponse = {
  ok: boolean;
  paymentId?: string;
  status: string | null;
  externalStatus?: string | null;
  activationStatus?: string | null;
  subscriptionStatus?: string | null;
  autoRenewAvailable?: boolean;
  autoRenewEnabled?: boolean;
  merchant?: "SITE" | "BOT" | null;
  message?: string | null;
};

export type AutoRenewState = {
  enabled: boolean;
  status: "DISABLED" | "ACTIVE" | "RETRY_SCHEDULED" | "MANUAL_ACTION_REQUIRED";
  merchant: "SITE" | "BOT" | null;
  nextPaymentAt: string | null;
  lastPaymentAt: string | null;
  method: { type: string | null; title: string | null; last4: string | null } | null;
};

export type PromoPreview = {
  code: string;
  name: string;
  valuePercent: number;
  durationDays: number;
  devicesLimit: number;
  originalAmount?: number;
  discountAmount?: number;
  finalAmount?: number;
};

export type ReferralStats = {
  referralCode: string;
  telegramBotStartUrl?: string | null;
  invitedCount: number;
  bonusBalanceRub: number;
  totalBonusRub: number;
};

export type SupportThreadUser = {
  id: string;
  email?: string | null;
  telegramId?: number | null;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramLastName?: string | null;
};

export type SupportThreadMessage = {
  id: string;
  threadId: string;
  userId: string;
  adminUserId?: string | null;
  adminTelegramId?: number | null;
  authorType: "USER" | "ADMIN";
  source: "TELEGRAM" | "WEBSITE" | "ADMIN_BOT" | "ADMIN_PANEL";
  contentKind?: "TEXT" | "PHOTO";
  hasAttachment?: boolean;
  text?: string | null;
  createdAt: string;
};

export type SupportThread = {
  id: string;
  status: "OPEN" | "CLOSED";
  lastMessageAt?: string | null;
  lastUserMessageAt?: string | null;
  lastAdminMessageAt?: string | null;
  user: SupportThreadUser | null;
  messages: SupportThreadMessage[];
};

export type TelegramAuthLinkResponse = {
  linkUrl: string;
  requestToken: string;
  expiresAt: string;
};

export type TelegramAuthStatusResponse = {
  status: "pending" | "confirmed";
  accessToken?: string;
  isNewUser?: boolean;
};

export type StoredTelegramAuthRequest = {
  requestToken: string;
  expiresAt: number;
};

export type DashboardUser = ApiUser & {
  hasTemporaryWebCredentials?: boolean;
};

export const planIcons = [IconStar, IconSparkles, IconShieldCheck];
export const planColors = ["brandCyan", "brandOrange", "brandMagenta"] as const;
export const TELEGRAM_AUTH_STORAGE_KEY = "nos_vpn_telegram_auth_request";
export const TELEGRAM_AUTH_TIMEOUT_MS = 2 * 60 * 1000;
export const SUPPORT_MESSAGES_PAGE_SIZE = 20;

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        openTelegramLink?: (url: string) => void;
      };
    };
  }
}
