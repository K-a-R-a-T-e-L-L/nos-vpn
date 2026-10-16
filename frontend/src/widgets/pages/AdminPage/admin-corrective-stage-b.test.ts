import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("referrer wrappers serialize the exact safe Stage B endpoints", () => {
  const api = source("./admin.lib.ts");
  assert.match(api, /getAdminReferrers/);
  assert.match(api, /\/api\/admin\/analytics\/referrals\/referrers/);
  assert.match(api, /getAdminReferrerInvites/);
  assert.match(
    api,
    /referrals\/referrers\/\$\{encodeURIComponent\(userId\)\}\/invites/,
  );
  assert.doesNotMatch(
    api,
    /providerPaymentId|paymentMethodId|subscriptionUrl|accessUrl/,
  );
});

test("admin tab selection is local-first and inactive panels are unmounted", () => {
  const panel = source("./AdminPanel.client.tsx");
  const routing = source("./hooks/useAdminTabRouting.ts");
  assert.match(routing, /useState<AdminPanelTab>/);
  assert.match(routing, /setActiveTabState\(nextTab\)[\s\S]*?router\.replace/);
  assert.match(panel, /keepMounted=\{false\}/);
  assert.match(panel, /useAdminPanel\(activeTab\)/);
  assert.doesNotMatch(panel, /Атрибуция/);
  assert.doesNotMatch(routing, /"attribution"/);
});

test("legacy queries are tab-gated and have explicit cache windows", () => {
  const hook = source("./useAdminPanel.ts");
  const supportHook = source(
    "../../../features/admin/support/useAdminSupport.ts",
  );
  assert.match(hook, /export function useAdminPanel\(activeTab/);
  assert.match(hook, /enabled:\s*activeTab === "promos"/);
  assert.match(hook, /useAdminSupport\(activeTab === "support"\)/);
  assert.match(supportHook, /enabled,/);
  assert.doesNotMatch(hook, /admin-analytics-(overview|sources|attributions)/);
  assert.match(hook, /staleTime:\s*60_000/);
  assert.match(hook, /gcTime:\s*5 \* 60_000/);
});

test("admin data tabs expose first-load, background and table loading states", () => {
  const finance = source("./tabs/AdminFinanceTab.tsx");
  const financeHook = source(
    "../../../features/admin/finance/useAdminFinance.ts",
  );
  const referrals = source("./tabs/AdminReferralTab.tsx");
  const referralsHook = source(
    "../../../features/admin/referrals/useAdminReferrals.ts",
  );
  const users = source("./sections/AdminUsersTab.tsx");
  const loading = source("./components/AdminQueryLoading.tsx");
  for (const code of [
    finance + financeHook,
    referrals + referralsHook,
    users,
  ]) {
    assert.match(code, /isFetching/);
    assert.match(code, /placeholderData:\s*keepPreviousData/);
  }
  assert.match(loading, /Skeleton/);
  assert.match(loading, /LoadingOverlay/);
  assert.match(loading, /aria-busy/);
  assert.match(referrals, /Рефереры/);
  assert.match(referrals, /Начислено за период/);
  assert.match(referrals, /В кошельке сейчас/);
  assert.match(referrals, /AdminReferrerDetailsDrawer/);
  assert.doesNotMatch(referrals, /reduce\(|successfulRevenue\s*\+/);
});

test("finance and referrals expose non-overlapping cash and lifetime wording", () => {
  const finance = source("./tabs/AdminFinanceTab.tsx");
  const referrals = source("./tabs/AdminReferralTab.tsx");
  const chart = source("./components/AdminMoneyTimeseriesChart.tsx");
  assert.match(finance, /Истекли:/);
  assert.match(chart, /Платежи/);
  assert.match(referrals, /Активность за выбранный период/);
  assert.match(referrals, /Успешные платежи/);
  assert.doesNotMatch(referrals, /label="Метрики"/);
  assert.match(referrals, /Конверсия считается за всё время/);
});

test("support does not render a false empty state during its initial pending load", () => {
  const support = source("./sections/AdminSupportTab.tsx");
  const panel = source("./AdminPanel.client.tsx");
  assert.match(support, /isThreadsFetching && !supportThreadsPage/);
  assert.match(support, /Загрузка обращений/);
  assert.match(support, /isThreadFetching && !supportThread/);
  assert.match(support, /Загрузка диалога/);
  assert.match(panel, /isThreadsFetching=\{admin\.supportThreadsQuery\.isFetching\}/);
});

test("support history renders private PHOTO previews and preserves truthful admin delivery", () => {
  const dashboard = source("../DashboardPage/sections/DashboardSupportCard.tsx");
  const support = source("./sections/AdminSupportTab.tsx");
  const supportHook = source("../../../features/admin/support/useAdminSupport.ts");
  const types = source("./admin.types.ts");
  assert.match(dashboard, /SupportPhotoPreview/);
  assert.match(dashboard, /message\.contentKind === "PHOTO"/);
  assert.match(support, /SupportPhotoPreview/);
  assert.match(support, /deliveryStatus === "FAILED"/);
  assert.match(supportHook, /AdminSupportReplyResult/);
  assert.match(supportHook, /setSupportDeliveryStatus\(result\.delivery\)/);
  assert.match(types, /SupportDeliveryStatus/);
  assert.doesNotMatch(dashboard + support, /telegramFileId|file_unique_id/);
});

test("admin support delivery status is scoped to the selected thread and send intent", () => {
  const supportHook = source("../../../features/admin/support/useAdminSupport.ts");
  assert.match(supportHook, /onMutate:\s*\(\)\s*=>\s*\{[\s\S]*setSupportDeliveryStatus\(null\)/);
  assert.match(supportHook, /setSelectedSupportThreadId:[\s\S]*setSupportDeliveryStatus\(null\)/);
});

test("referrer details render server-aggregated awarded earnings for three fixed periods", () => {
  const drawer = source("./components/AdminReferrerDetailsDrawer.tsx");
  const types = source("./admin.types.ts");
  assert.match(drawer, />Заработок</);
  assert.match(drawer, /data\.earnings\.currentMonth/);
  assert.match(drawer, /data\.earnings\.previousMonth/);
  assert.match(drawer, /data\.earnings\.allTime/);
  assert.match(drawer, /Фактически начисленные/);
  assert.match(types, /timezone:\s*"Europe\/Moscow"/);
  assert.doesNotMatch(drawer, /reduce\(|bonusRub\s*\+/);
});

test("admin filter options are Russian while API enum values remain unchanged", () => {
  const dictionaries = source("./admin-stage3.ts");
  const finance = source("./tabs/AdminFinanceTab.tsx");
  const referrals = source("./tabs/AdminReferralTab.tsx");
  const users = source("./sections/AdminUsersTab.tsx");
  for (const value of [
    "SUCCEEDED",
    "FIRST_PURCHASE",
    "CURRENT_MONTH",
    "PENDING_WINDOW",
    "EVER_PAID",
    "IS_REFERRER",
  ]) {
    assert.match(dictionaries, new RegExp(`"${value}"`));
  }
  for (const label of [
    "Успешно",
    "Первая покупка",
    "Текущий месяц",
    "Ожидает начисления",
    "Оплачивали",
    "Приглашали пользователей",
  ]) {
    assert.match(dictionaries, new RegExp(label));
  }
  assert.match(finance, /ADMIN_PAYMENT_STATUS_OPTIONS/);
  assert.match(finance, /ADMIN_PAYMENT_TYPE_OPTIONS/);
  assert.match(referrals, /ADMIN_LEDGER_STATUS_OPTIONS/);
  assert.match(users, /ADMIN_AUTH_CHANNEL_OPTIONS/);
  assert.doesNotMatch(users, /Internal UUID/);
  assert.match(users, /Telegram ID точно/);
});

test("login has route-local 12px gutters and full-width safe mobile controls", () => {
  const page = source("../LoginPage/LoginPage.client.tsx");
  const intro = source("../LoginPage/sections/LoginIntroCard.tsx");
  const auth = source("../LoginPage/sections/LoginAuthCard.tsx");
  const css = source("../LoginPage/LoginPage.module.css");
  assert.doesNotMatch(page, /<PageSection/);
  assert.match(css, /margin-inline:\s*-4px/);
  assert.match(intro, /p=\{\{\s*base:\s*"md",\s*sm:\s*"xl"\s*\}\}/);
  assert.match(intro, /fullWidth/);
  assert.match(auth, /p=\{\{\s*base:\s*"md",\s*sm:\s*"xl"\s*\}\}/);
  assert.match(auth, /className=\{styles\.authTabsList\}/);
  assert.match(auth, /fullWidth/);
});

test("admin destructive actions share one pending-safe confirmation dialog", () => {
  const dialog = source("./components/AdminConfirmDialog.tsx");
  assert.match(dialog, /<Modal/);
  assert.match(dialog, /closeOnEscape=\{!pending\}/);
  assert.match(dialog, /closeOnClickOutside=\{!pending\}/);
  assert.match(dialog, /withCloseButton=\{!pending\}/);
  assert.match(dialog, /loading=\{pending\}/);
  assert.match(dialog, /disabled=\{pending\}/);
  assert.match(dialog, /inFlightRef/);
  assert.doesNotMatch(dialog, /window\.confirm/);
});

test("promo and support actions require confirmation", () => {
  const promos = source("./sections/AdminPromosTab.tsx");
  const support = source("./sections/AdminSupportTab.tsx");
  for (const code of [promos, support]) {
    assert.match(code, /AdminConfirmDialog/);
  }
  assert.match(promos, /Удалить промокод\?/);
  assert.match(support, /Закрыть обращение\?/);
});

test("promo redesign distinguishes first load, background refresh and row-scoped mutations", () => {
  const promos = source("./sections/AdminPromosTab.tsx");
  const panel = source("./AdminPanel.client.tsx");
  const hook = source("./useAdminPanel.ts");
  const styles = source("./sections/AdminPromosTab.module.css");
  assert.match(promos, /isLoading/);
  assert.match(promos, /isFetching/);
  assert.match(promos, /AdminTableSkeleton/);
  assert.match(promos, /Обновление данных/);
  assert.match(promos, /deletingPromoId/);
  assert.match(promos, /savingPromoId/);
  assert.match(promos, /promo\.id === deletingPromoId/);
  assert.match(promos, /hiddenFrom="sm"/);
  assert.match(promos, /visibleFrom="sm"/);
  assert.match(promos, /Недоступен по сроку/);
  assert.match(promos, /formatAdminDate/);
  assert.match(promos, /promo\.startsAt/);
  assert.match(panel, /isLoading=\{admin\.promoQuery\.isLoading\}/);
  assert.match(panel, /deletingPromoId=/);
  assert.match(hook, /deletePromoMutation\.variables/);
  assert.match(styles, /grid-template-columns: minmax\(0, 0\.35fr\) minmax\(0, 0\.65fr\)/);
  assert.match(styles, /white-space: nowrap/);
  assert.match(styles, /overflow-wrap: normal/);
  assert.doesNotMatch(promos, /actionsLocked/);
  assert.doesNotMatch(promos, /miw=\{760\}/);
});

test("promo mutations fence only the conflicting edit row and reset through delete success", () => {
  const promos = source("./sections/AdminPromosTab.tsx");
  const panel = source("./AdminPanel.client.tsx");
  const hook = source("./useAdminPanel.ts");
  assert.match(promos, /editingPromoId === deletingPromoId/);
  assert.match(promos, /formDisabled/);
  assert.match(promos, /disabled=\{formDisabled\}/);
  assert.match(promos, /rowIsBusy/);
  assert.match(panel, /admin\.editingPromoId === admin\.deletingPromoId/);
  assert.match(panel, /deletePromoMutation\.mutateAsync/);
  assert.doesNotMatch(panel, /await admin\.deletePromoMutation\.mutateAsync\(promoId\)[\s\S]*admin\.editingPromoId === promoId/);
  assert.match(hook, /onSuccess:\s*\(_result, deletedPromoId\)/);
  assert.match(hook, /deletedPromoId[\s\S]*setEditingPromoId\(null\)/);
  assert.match(hook, /setPromoForm\(initialPromoForm\)/);
});

test("promo status separates primary state from optional schedule context", () => {
  const promos = source("./sections/AdminPromosTab.tsx");
  assert.match(promos, /primaryStatus/);
  assert.match(promos, /scheduleText/);
  assert.match(promos, /scheduleText \? <Text/);
  assert.doesNotMatch(promos, /<Text className=\{styles\.statusText\}[^>]*>\{formatAvailability\(promo\)\}<\/Text>/);
});

test("all admin mutation forms disable conflicting controls while pending", () => {
  const plans = source("./sections/AdminPlansTab.tsx");
  const promos = source("./sections/AdminPromosTab.tsx");
  const support = source("./sections/AdminSupportTab.tsx");
  const panel = source("./AdminPanel.client.tsx");
  assert.match(plans, /disabled=\{isSaving\}/);
  assert.match(promos, /disabled=\{isSaving\}/);
  assert.match(promos, /deletingPromoId/);
  assert.doesNotMatch(promos, /actionsLocked/);
  assert.match(support, /disabled=\{isReplyPending \|\| isClosePending\}/);
  assert.match(panel, /deletePromoMutation\.mutateAsync/);
  assert.match(panel, /closeSupportThreadMutation\.mutateAsync/);
});

test("user details hard delete reuses the shared confirmation and preserves pending/error context", () => {
  const users = source("./sections/AdminUsersTab.tsx");
  const details = source(
    "../../../features/admin/users/AdminUserDetailsDrawer.tsx",
  );
  const api = source("./admin.lib.ts");
  assert.match(details, /Удалить пользователя/);
  assert.match(details, /Удалить пользователя\?/);
  assert.match(details, /Удалить навсегда/);
  assert.match(details, /безвозвратно удалены/);
  assert.match(details, /Восстановить данные будет невозможно/);
  assert.match(details, /AdminConfirmDialog/);
  assert.match(details, /deleteUserMutation\.mutateAsync/);
  assert.match(details, /pending=\{deleteUserMutation\.isPending\}/);
  assert.match(details, /queryClient\.invalidateQueries/);
  assert.match(users, /setSelectedUserId\(null\)/);
  assert.match(api, /deleteAdminUser/);
  assert.match(api, /adminDelete/);
  assert.match(api, /\/api\/admin\/user\/\$\{encodeURIComponent\(userId\)\}/);
  assert.doesNotMatch(users, /window\.confirm/);
  assert.doesNotMatch(users, /setBlocked|\/block|deactivat|softDelete/i);
});
