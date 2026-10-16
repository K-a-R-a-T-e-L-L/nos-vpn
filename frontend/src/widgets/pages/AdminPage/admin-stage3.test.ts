import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAdminQueryString,
  formatAdminMoney,
  normalizeAdminQuery,
  stableAdminQueryKey,
} from "./admin-stage3.ts";

test("admin query serialization preserves false and arrays, omits ALL/empty/undefined", () => {
  const query = buildAdminQueryString({
    preset: "CUSTOM",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-02",
    provider: "ALL",
    merchant: "BOT",
    referred: false,
    statuses: ["SUCCEEDED", "FAILED"],
    promoCode: "",
    userSearch: undefined,
    page: 2,
    sortBy: "paidAt",
    sortDir: "DESC",
  });

  assert.equal(
    query,
    "preset=CUSTOM&dateFrom=2026-08-01&dateTo=2026-08-02&merchant=BOT&referred=false&statuses=SUCCEEDED%2CFAILED&page=2&sortBy=paidAt&sortDir=DESC",
  );
});

test("normalized stable keys do not depend on object insertion order", () => {
  const first = stableAdminQueryKey("payments", {
    page: 2,
    merchant: "SITE",
    provider: "ALL",
  });
  const second = stableAdminQueryKey("payments", {
    provider: "ALL",
    merchant: "SITE",
    page: 2,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(
    normalizeAdminQuery({
      provider: "ALL",
      empty: "",
      missing: undefined,
      blocked: false,
    }),
    {
      blocked: false,
    },
  );
});

test("money formatter consumes backend decimal strings without arithmetic", () => {
  assert.equal(formatAdminMoney("1234.50", "RUB"), "1 234,50 ₽");
  assert.equal(formatAdminMoney("0.00"), "0,00 ₽");
});

test("Stage 3 API wrappers use only the safe server-side endpoints", () => {
  const source = readFileSync(
    "src/widgets/pages/AdminPage/admin.lib.ts",
    "utf8",
  );
  for (const endpoint of [
    "/api/admin/analytics/money/overview",
    "/api/admin/analytics/money/timeseries",
    "/api/admin/analytics/money/breakdowns",
    "/api/admin/analytics/money/payments",
    "/api/admin/analytics/referrals/overview",
    "/api/admin/analytics/referrals",
    "/api/admin/user/query",
    "/details",
  ]) {
    assert.match(source, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

test("users list stays credential-free while the drawer uses only narrow approved controls", () => {
  const usersSource = readFileSync(
    "src/widgets/pages/AdminPage/sections/AdminUsersTab.tsx",
    "utf8",
  );
  const detailsSource = readFileSync(
    "src/features/admin/users/AdminUserDetailsDrawer.tsx",
    "utf8",
  );
  const panelSource = readFileSync(
    "src/widgets/pages/AdminPage/AdminPanel.client.tsx",
    "utf8",
  );
  const apiSource = readFileSync(
    "src/widgets/pages/AdminPage/admin.lib.ts",
    "utf8",
  );
  assert.doesNotMatch(
    usersSource,
    /subscriptionUrl|rawConfig|providerExternalId|providerClientKey|paymentMethodId|providerPaymentId/,
  );
  assert.doesNotMatch(
    panelSource,
    /walletDraft|configureSubscriptionMutation|deleteUserMutation|updateUserBlockMutation/,
  );
  assert.match(usersSource, /queryAdminUsers/);
  assert.match(detailsSource, /getAdminUserDetails/);
  for (const value of [
    "Управление подпиской",
    "Доступ",
    "Деактивировать подписку",
    "Автопродление YooKassa",
    "Автопродление не подключено",
    "getAdminUserAccess",
    "configureAdminUserSubscription",
    "stopAdminUserSubscription",
    "disableAdminUserYooKassaAutoRenew",
    "IconCopy",
    "actionsLocked",
  ])
    assert.match(detailsSource, new RegExp(value));
  assert.match(
    detailsSource,
    /queryKey:\s*\["admin-stage3", "user-access", userId\]/,
  );
  const accessQuerySource = detailsSource.slice(
    detailsSource.indexOf("const access = useQuery"),
    detailsSource.indexOf("useEffect"),
  );
  assert.doesNotMatch(accessQuerySource, /placeholderData:\s*keepPreviousData/);
  assert.match(
    detailsSource,
    /placeholderData:\s*\(previousData\)\s*=>[\s\S]*?previousData\?\.profile\?\.id\s*===\s*userId/,
  );
  assert.match(detailsSource, /details\.data\?\.profile\.id\s*===\s*userId/);
  assert.doesNotMatch(
    detailsSource,
    /rawConfig|qrPayload|providerExternalId|providerClientKey|admin\/payments\/platega\/recurrent/,
  );
  assert.match(
    detailsSource,
    /removeQueries\(\{[\s\S]*?queryKey: \["admin-stage3", "user-access", userId\]/,
  );
  for (const endpoint of [
    "/api/admin/user/${encodeURIComponent(userId)}/subscription",
    "/api/admin/user/${encodeURIComponent(userId)}/subscription/stop",
    "/api/admin/user/${encodeURIComponent(userId)}/access",
    "/api/admin/user/${encodeURIComponent(userId)}/auto-renew/yookassa/disable",
    "/api/admin/user/${encodeURIComponent(userId)}/recurrent",
    "/api/admin/user/${encodeURIComponent(userId)}/recurrent/${encodeURIComponent(agreementId)}/cancel",
    "/api/admin/user/${encodeURIComponent(userId)}/recurrent/${encodeURIComponent(agreementId)}/reconcile",
  ])
    assert.ok(apiSource.includes(endpoint));

  assert.match(detailsSource, /Автопродление не подключено/);
  assert.match(detailsSource, /Отменить автопродление/);
  assert.match(detailsSource, /Сверить с Platega/);
  assert.match(detailsSource, /Будущие списания будут остановлены\. Уже оплаченный период доступа сохранится\./);
  assert.match(detailsSource, /cancelRecurrentMutation\.isPending/);
  assert.match(detailsSource, /reconcileRecurrentMutation\.isPending/);
  assert.match(detailsSource, /\["admin-stage3", "user-recurrent", userId\]/);
  assert.doesNotMatch(detailsSource, /admin\/payments\/platega\/recurrent/);
});

test("users table makes role and blocked state semantic and prevents narrow wrapping", () => {
  const usersSource = readFileSync(
    "src/widgets/pages/AdminPage/sections/AdminUsersTab.tsx",
    "utf8",
  );
  assert.match(usersSource, /\[\"Роль\",\s*120\]/);
  assert.doesNotMatch(usersSource, /Роль \/ статус/);
  assert.match(usersSource, /\{user\.role\}/);
  assert.match(
    usersSource,
    /color=\{user\.role === "ADMIN" \? "violet" : "gray"\}/,
  );
  assert.match(
    usersSource,
    /user\.isBlocked \?[\s\S]*?color="red"[\s\S]*?BLOCKED[\s\S]*?<\/Badge>/,
  );
  assert.doesNotMatch(usersSource, /user\.isBlocked \? "Блок" : "Активен"/);
  assert.match(usersSource, /<Table miw=\{1770\}/);
  assert.match(usersSource, /whiteSpace: "nowrap"/);
  assert.match(usersSource, /overflowWrap: "anywhere"/);
  assert.match(usersSource, /queryAdminUsers/);
  assert.match(usersSource, /setSelectedUserId\(user\.id\)/);
});
