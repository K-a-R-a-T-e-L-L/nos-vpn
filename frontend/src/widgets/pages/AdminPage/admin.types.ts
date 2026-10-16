export type AdminDashboardSummary = {
  totalUsers: number;
  activeSubscriptions: number;
  activePlans: number;
  activePromos: number;
  openSupportThreads: number;
};

export type PromoCode = {
  id: string;
  code: string;
  name: string;
  valuePercent: number;
  status: "ACTIVE" | "INACTIVE";
  maxUses?: number | null;
  durationDays: number;
  devicesLimit: number;
  startsAt?: string | null;
  expiresAt: string;
  usedCount?: number;
  reservedCount?: number;
  isAvailable?: boolean;
};

export type AdminPaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminPlan = {
  id: string;
  code?: string | null;
  title?: string | null;
  description?: string | null;
  name: string;
  period: number;
  amount: number;
  isActive: boolean;
  devicesLimit?: number | null;
};

export type AdminPlanCatalogCell = {
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

export type AdminPlanCatalogDuration = {
  periodDays: number;
  months: number;
  label: string;
  startingPriceRub: number;
  savingsPercent: number | null;
};

export type AdminPlanCatalogRow = {
  devicesLimit: number;
  devicesLabel: string;
  plans: Array<AdminPlanCatalogCell | null>;
};

export type AdminPlanCatalog = {
  durations: AdminPlanCatalogDuration[];
  rows: AdminPlanCatalogRow[];
};

export type SupportThreadSummary = {
  id: string;
  status: "OPEN" | "CLOSED";
  lastMessageAt?: string | null;
  lastUserMessageAt?: string | null;
  lastAdminMessageAt?: string | null;
  user: {
    id: string;
    email?: string | null;
    telegramId?: number | null;
    telegramUsername?: string | null;
    telegramFirstName?: string | null;
    telegramLastName?: string | null;
  } | null;
  latestMessage?: {
    id: string;
    authorType: "USER" | "ADMIN";
    source: string;
    contentKind?: "TEXT" | "PHOTO";
    hasAttachment?: boolean;
    text?: string | null;
    createdAt: string;
  } | null;
};

export type SupportThreadDetail = {
  id: string;
  status: "OPEN" | "CLOSED";
  lastMessageAt?: string | null;
  lastUserMessageAt?: string | null;
  lastAdminMessageAt?: string | null;
  user: SupportThreadSummary["user"];
  messages: {
    id: string;
    authorType: "USER" | "ADMIN";
    source: string;
    contentKind?: "TEXT" | "PHOTO";
    hasAttachment?: boolean;
    text?: string | null;
    createdAt: string;
    adminTelegramId?: number | null;
    adminUserId?: string | null;
  }[];
};

export type SupportDeliveryStatus = "SENT" | "PARTIAL" | "FAILED" | "NO_TELEGRAM_ID" | "SKIPPED_DUPLICATE";

export type AdminSupportReplyResult = {
  thread: SupportThreadDetail;
  delivery: SupportDeliveryStatus;
};

export type PlanCatalogDraftCell = {
  period: number;
  devicesLimit: number;
  amount: number;
  isActive: boolean;
};

export type PromoFormState = {
  code: string;
  name: string;
  valuePercent: number;
  maxUses: number;
  durationDays: number;
  devicesLimit: number;
  status: PromoCode["status"];
};

export type AdminAnalyticsPeriodPreset =
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "CURRENT_MONTH"
  | "PREVIOUS_MONTH"
  | "CUSTOM";
export type AdminProviderFilter = "ALL" | "YOOKASSA" | "PLATEGA";
export type AdminMerchantFilter = "ALL" | "SITE" | "BOT";
export type AdminPaymentType =
  | "FIRST_PURCHASE"
  | "MANUAL_RENEWAL"
  | "RECURRENT"
  | "BONUS"
  | "PROMO_DISCOUNT";
export type AdminSortDirection = "ASC" | "DESC";

export type AdminAnalyticsFilters = {
  preset?: AdminAnalyticsPeriodPreset;
  dateFrom?: string;
  dateTo?: string;
  provider?: AdminProviderFilter;
  merchant?: AdminMerchantFilter;
  planId?: string;
  promoCode?: string;
  userSearch?: string;
  referred?: boolean;
};

export type AdminAnalyticsPeriod = {
  from: string;
  to: string;
  timezone: "Europe/Moscow";
  preset: AdminAnalyticsPeriodPreset;
};
export type AdminMoneyOverview = {
  period: AdminAnalyticsPeriod;
  grossRevenue: string;
  successfulPayments: number;
  uniquePayingUsers: number;
  averageCheck: string;
  firstPurchases: number;
  manualRenewals: number;
  recurrentPayments: number;
  failedPayments: number;
  canceledPayments: number;
  expiredPayments: number;
};
export type AdminMoneyTimeseriesPoint = {
  date: string;
  grossRevenue: string;
  successfulPayments: number;
  firstPurchases: number;
  manualRenewals: number;
  recurrentPayments: number;
  failedPayments: number;
  canceledPayments: number;
};
export type AdminMoneyTimeseries = {
  period: AdminAnalyticsPeriod;
  items: AdminMoneyTimeseriesPoint[];
};
export type AdminBreakdownItem = {
  key: string;
  label: string;
  successfulPayments: number;
  grossRevenue: string;
};
export type AdminPromoUsageBreakdown = {
  key: string;
  label: string;
  usageCount: number;
};
export type AdminMoneyBreakdowns = {
  period: AdminAnalyticsPeriod;
  byMerchant: AdminBreakdownItem[];
  byProvider: AdminBreakdownItem[];
  byPaymentType: AdminBreakdownItem[];
  byPlan: AdminBreakdownItem[];
  byStatus: AdminBreakdownItem[];
  promoUsage: AdminPromoUsageBreakdown[];
};
export type AdminSafeUser = {
  id?: string | null;
  label: string;
  email?: string | null;
  telegramUsername?: string | null;
};
export type AdminSafePlan = {
  id?: string | null;
  code?: string | null;
  title?: string | null;
};
export type AdminPaymentItem = {
  id: string;
  shortId: string;
  createdAt: string;
  paidAt?: string | null;
  user: AdminSafeUser;
  merchant?: string | null;
  provider: string;
  paymentType: AdminPaymentType;
  plan: AdminSafePlan;
  promoCode?: string | null;
  amount: string;
  currency: string;
  status: string;
  activationStatus?: string | null;
};
export type AdminPaymentQuery = AdminAnalyticsFilters & {
  statuses?: string[];
  paymentType?: "ALL" | AdminPaymentType;
  page?: number;
  pageSize?: 25 | 50 | 100;
  sortBy?: "paidAt" | "createdAt" | "amount" | "status";
  sortDir?: AdminSortDirection;
};
export type AdminPaymentPage = AdminPaginatedResponse<AdminPaymentItem> & {
  period: AdminAnalyticsPeriod;
};

export type AdminReferralOverview = {
  period: AdminAnalyticsPeriod;
  referredRegistrations: number;
  referredPayingUsers: number;
  successfulPayments: number;
  conversionPercent: string;
  referredGrossRevenue: string;
  awardedBonusTotal: string;
  pendingBonusCount: number;
  rejectedBonusCount: number;
};
export type AdminReferralItem = {
  referrer: AdminSafeUser;
  invitedUser: AdminSafeUser;
  registeredAt: string;
  firstPaidAt?: string | null;
  successfulPayments: number;
  successfulRevenue: string;
  awardedBonus: string;
  latestLedgerStatus?: string | null;
  latestMerchant?: string | null;
  latestPlan: AdminSafePlan;
  latestPromoCode?: string | null;
};
export type AdminReferralQuery = {
  preset?: AdminAnalyticsPeriodPreset;
  dateFrom?: string;
  dateTo?: string;
  referrerSearch?: string;
  invitedSearch?: string;
  ledgerStatus?: string[];
  merchant?: AdminMerchantFilter;
  planId?: string;
  promoCode?: string;
  page?: number;
  pageSize?: 25 | 50 | 100;
  sortBy?:
    | "registeredAt"
    | "firstPaidAt"
    | "successfulRevenue"
    | "awardedBonus";
  sortDir?: AdminSortDirection;
};
export type AdminReferralPage = AdminPaginatedResponse<AdminReferralItem> & {
  period: AdminAnalyticsPeriod;
};

export type AdminReferrerMetricScope = "LIFETIME" | "PERIOD";
export type AdminReferrerQuery = {
  preset?: AdminAnalyticsPeriodPreset;
  dateFrom?: string;
  dateTo?: string;
  referrerSearch?: string;
  onlyWithInvited?: boolean;
  onlyWithPayingInvited?: boolean;
  metricScope?: AdminReferrerMetricScope;
  page?: number;
  pageSize?: 10 | 25 | 50 | 100;
  sortBy?:
    | "invitedUsers"
    | "payingInvitedUsers"
    | "referredGrossRevenue"
    | "lifetimeAwardedBonus"
    | "currentWalletBalance"
    | "lastReferralAt";
  sortDir?: AdminSortDirection;
};
export type AdminReferrerPeriodMetrics = {
  invitedUsers: number;
  payingInvitedUsers: number;
  referredSuccessfulPayments: number;
  referredGrossRevenue: string;
  awardedBonus: string;
};
export type AdminReferrerItem = {
  referrer: AdminSafeUser;
  invitedUsers: number;
  payingInvitedUsers: number;
  referralConversionPercent: string;
  referredSuccessfulPayments: number;
  referredGrossRevenue: string;
  lifetimeAwardedBonus: string;
  currentWalletBalance: string;
  firstReferralAt?: string | null;
  lastReferralAt?: string | null;
  lastAwardedAt?: string | null;
  periodMetrics: AdminReferrerPeriodMetrics;
};
export type AdminReferrerPage = AdminPaginatedResponse<AdminReferrerItem> & {
  period: AdminAnalyticsPeriod;
};
export type AdminReferrerInvitesQuery = {
  preset?: AdminAnalyticsPeriodPreset;
  dateFrom?: string;
  dateTo?: string;
  invitedSearch?: string;
  paidState?: "ALL" | "EVER_PAID" | "NEVER_PAID";
  page?: number;
  pageSize?: 10 | 25 | 50 | 100;
  sortBy?: "registeredAt" | "firstPaidAt" | "successfulRevenue";
  sortDir?: AdminSortDirection;
};
export type AdminReferrerInviteItem = {
  invitedUser: AdminSafeUser;
  registeredAt: string;
  firstPaidAt?: string | null;
  successfulPayments: number;
  successfulRevenue: string;
  awardedBonus: string;
  latestLedgerStatus?: string | null;
  latestMerchant?: string | null;
  latestPlan: AdminSafePlan;
  latestPromoCode?: string | null;
};
export type AdminReferrerInvitesPage =
  AdminPaginatedResponse<AdminReferrerInviteItem> & {
    period: AdminAnalyticsPeriod;
    referrer: AdminSafeUser;
    lifetimeAwardedBonus: string;
    currentWalletBalance: string;
    earnings: {
      currentMonth: string;
      previousMonth: string;
      allTime: string;
      timezone: "Europe/Moscow";
      currentMonthFrom: string;
      currentMonthTo: string;
      previousMonthFrom: string;
    };
  };

export type AdminSafeUserSubscription = {
  state: "ACTIVE" | "EXPIRED" | "NONE";
  status?: string | null;
  planId?: string | null;
  planTitle?: string | null;
  endsAt?: string | null;
  autoRenewEnabled: boolean;
};
export type AdminSafeUserItem = {
  id: string;
  label: string;
  email?: string | null;
  telegramUsername?: string | null;
  authChannels: ("EMAIL" | "TELEGRAM")[];
  createdAt: string;
  role: string;
  isBlocked: boolean;
  subscription: AdminSafeUserSubscription;
  successfulPaidTotal: string;
  successfulPayments: number;
  lastPaidAt?: string | null;
  referredUsersCount: number;
  wasReferred: boolean;
};
export type AdminUserQuery = {
  search?: string;
  userId?: string;
  telegramId?: string;
  registeredFrom?: string;
  registeredTo?: string;
  role?: string;
  blocked?: boolean;
  authChannel?: "ALL" | "EMAIL" | "TELEGRAM" | "BOTH";
  subscriptionState?: "ALL" | "ACTIVE" | "EXPIRED" | "NONE";
  planId?: string;
  expiresBefore?: string;
  expiresAfter?: string;
  autoRenewEnabled?: boolean;
  paymentState?: "ALL" | "EVER_PAID" | "NEVER_PAID";
  referralState?: "ALL" | "IS_REFERRER" | "WAS_REFERRED";
  promoCode?: string;
  page?: number;
  pageSize?: 25 | 50 | 100;
  sortBy?:
    | "createdAt"
    | "email"
    | "subscriptionEndsAt"
    | "successfulPaidTotal"
    | "lastPaidAt";
  sortDir?: AdminSortDirection;
};
export type AdminSafeUsersPage = AdminPaginatedResponse<AdminSafeUserItem>;
export type AdminUserDetails = {
  profile: AdminSafeUserItem;
  paymentHistory: AdminPaymentItem[];
  paymentTotal: number;
  paymentPage: number;
  paymentPageSize: number;
  promoUsages: {
    promoCode: string;
    status: string;
    appliedAt?: string | null;
  }[];
  referral: {
    referrer?: AdminSafeUser | null;
    referredUsersCount: number;
    referredPayingUsers: number;
    awardedBonusTotal: string;
    currentWalletBalance: string;
  };
  supportSummary: {
    status?: string | null;
    messagesCount: number;
    lastMessageAt?: string | null;
    lastUserMessageAt?: string | null;
    lastAdminMessageAt?: string | null;
  };
};

export type AdminUserAccessResponse = {
  status?: string | null;
  deliveryMode: string;
  subscriptionUrl?: string | null;
  expiresAt?: string | null;
  planTitle?: string | null;
};

export type AdminPlategaRecurrentAgreement = {
  id: string;
  userId: string;
  merchant: "SITE" | "BOT";
  status:
    | "CREATING"
    | "PENDING_AGREEMENT"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELLED"
    | "FAILED"
    | "UNKNOWN";
  providerStatus?: string | null;
  planId: string;
  planName?: string | null;
  planPeriodDays?: number | null;
  amount: number;
  currency: string;
  cadence: "MONTHLY" | "YEARLY" | null;
  nextChargeAt?: string | null;
  lastChargeAt?: string | null;
  cancelledAt?: string | null;
  consentAcceptedAt?: string | null;
  consentLegalVersion?: string | null;
  canCancel: boolean;
  canReconcile: boolean;
  createdAt: string;
};

export type AdminRetentionSegment = "ACTIVE_PAID" | "ACTIVE_REPEAT" | "REPEAT_EVER" | "ONE_PAYMENT_NO_PAID_ENTITLEMENT" | "TRIAL_ONLY_NO_ENTITLEMENT" | "TRIAL_TO_PAID";
export type AdminRetentionOverview = { asOf: string; timezone: "Europe/Moscow"; scope: "LIFETIME_CURRENT_SNAPSHOT"; customerUsers: number; currentPaidUsers: number; activeRepeatPayers: number; repeatPayersEver: number; onePaymentNoPaidEntitlement: number; trialOnlyNoEntitlement: number; trialUsers: number; trialConvertedUsers: number; payingUsersEver: number; trialConversionRate: string; repeatPurchaseRate: string; };
export type AdminRetentionUserItem = { user: AdminSafeUser; registeredAt: string; hasUsedTrial: boolean; trialUsedAt?: string | null; firstPaidAt?: string | null; lastPaidAt?: string | null; successfulCashPayments: number; recurringCashPayments: number; currentEntitlement: "PAID" | "TRIAL" | "NONE"; subscriptionStatus?: string | null; subscriptionEndsAt?: string | null; graceEndsAt?: string | null; currentPlan: AdminSafePlan | null; isBlocked: boolean; };
export type AdminRetentionUsersQuery = { segment: AdminRetentionSegment; search?: string; page?: number; pageSize?: 10 | 25 | 50 | 100; sortBy?: "registeredAt" | "firstPaidAt" | "lastPaidAt" | "cashPayments" | "subscriptionEndsAt"; sortDir?: AdminSortDirection; };
export type AdminRetentionUsersPage = AdminPaginatedResponse<AdminRetentionUserItem> & { asOf: string; timezone: "Europe/Moscow"; segment: AdminRetentionSegment; };
export type AdminRetentionCohortItem = { month: string; registeredUsers: number; trialUsers: number; payingUsersEver: number; repeatPayersEver: number; activePaidUsers: number; onePaymentNoPaidEntitlement: number; trialOnlyNoEntitlement: number; trialConvertedUsers: number; trialConversionRate: string; repeatPurchaseRate: string; };
export type AdminRetentionCohorts = { asOf: string; timezone: "Europe/Moscow"; cohortType: "REGISTRATION_MONTH"; outcomeMode: "LIFETIME_TO_AS_OF"; months: 6 | 12 | 24; items: AdminRetentionCohortItem[]; };
