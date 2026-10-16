import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("retention tab uses dedicated safe APIs and no causal churn wording", () => {
  const api = readFileSync("src/widgets/pages/AdminPage/admin.lib.ts", "utf8");
  const tab = readFileSync("src/widgets/pages/AdminPage/tabs/AdminRetentionTab.tsx", "utf8");
  const panel = readFileSync("src/widgets/pages/AdminPage/AdminPanel.client.tsx", "utf8");
  const routing = readFileSync("src/widgets/pages/AdminPage/hooks/useAdminTabRouting.ts", "utf8");
  assert.match(api, /retention\/overview/);
  assert.match(api, /retention\/users/);
  assert.match(api, /retention\/cohorts/);
  assert.match(panel, /Удержание/);
  assert.match(routing, /"retention"/);
  assert.match(tab, /ONE_PAYMENT_NO_PAID_ENTITLEMENT/);
  assert.match(tab, /Trial без оплаты · без доступа/);
  assert.match(tab, /Показатели рассчитаны к текущему моменту/);
  assert.doesNotMatch(tab, /D30|D60|churn rate|ушёл по своей воле/i);
  assert.doesNotMatch(tab, /placeholderData/);
  assert.match(tab, /AdminUserDetailsDrawer/);
});

test("users block filter names only the account block state", () => {
  const users = readFileSync("src/widgets/pages/AdminPage/sections/AdminUsersTab.tsx", "utf8");
  assert.match(users, /Не заблокирован/);
});

test("retention redesign preserves all analytics while separating primary and secondary decisions", () => {
  const tab = readFileSync("src/widgets/pages/AdminPage/tabs/AdminRetentionTab.tsx", "utf8");
  const styles = readFileSync("src/widgets/pages/AdminPage/tabs/AdminRetentionTab.module.css", "utf8");
  for (const field of [
    "currentPaidUsers",
    "activeRepeatPayers",
    "repeatPayersEver",
    "onePaymentNoPaidEntitlement",
    "trialOnlyNoEntitlement",
    "trialConvertedUsers",
    "repeatPurchaseRate",
  ]) assert.match(tab, new RegExp(field));
  assert.match(tab, /primaryKpis/);
  assert.match(tab, /secondaryKpis/);
  assert.match(tab, /История оплат за всё время \+ текущее состояние доступа/);
  assert.match(tab, /data\.timezone/);
  assert.doesNotMatch(tab, /· Europe\/Moscow/);
  assert.match(tab, /AdminKpiSkeleton/);
  assert.match(tab, /Обновление данных/);
  assert.match(tab, /Результатов:/);
  assert.match(tab, /grace-период и другие детали доступны в административной карточке пользователя/);
  assert.match(tab, /cohortDiagnostics/);
  assert.match(tab, /trialUsers/);
  assert.match(tab, /Progress/);
  assert.match(tab, /data-empty-cohort/);
  assert.match(tab, /hiddenFrom="sm"/);
  assert.match(styles, /@media \(min-width: 1200px\)/);
  assert.match(styles, /overflow-wrap: normal/);
  assert.doesNotMatch(tab, /miw=\{1450\}|miw=\{1300\}/);
});

test("retention snapshot timezone and details copy come from the response contract", () => {
  const tab = readFileSync("src/widgets/pages/AdminPage/tabs/AdminRetentionTab.tsx", "utf8");
  assert.match(tab, /formatAdminDateTime\(data\.asOf\)/);
  assert.match(tab, /data\.timezone/);
  assert.match(tab, /grace-период и другие детали доступны в административной карточке пользователя/);
  assert.doesNotMatch(tab, /Срез:[^\n]*Europe\/Moscow/);
  assert.doesNotMatch(tab, /доступны в Администраторская карточка/);
});
