import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("dashboard delegates Telegram synchronization and has no effect-driven support reset", () => {
  const dashboard = read("src/widgets/pages/DashboardPage/DashboardPage.client.tsx");
  const hook = read("src/widgets/pages/DashboardPage/hooks/useDashboardTelegramLink.ts");

  assert.match(dashboard, /useDashboardTelegramLink/);
  assert.doesNotMatch(dashboard, /setVisibleSupportMessages\(SUPPORT_MESSAGES_PAGE_SIZE\)/);
  assert.match(hook, /TELEGRAM_LINK_REFRESH_BUFFER_MS/);
  assert.match(hook, /userControllerCreateTelegramLink/);
});

test("admin panel delegates local-first URL tab routing", () => {
  const panel = read("src/widgets/pages/AdminPage/AdminPanel.client.tsx");
  const routing = read("src/widgets/pages/AdminPage/hooks/useAdminTabRouting.ts");

  assert.match(panel, /useAdminTabRouting/);
  assert.match(routing, /pendingTabRef/);
  assert.match(routing, /router\.replace/);
});

test("unused UI dependencies are absent while d3 and generated API remain", () => {
  const packageJson = JSON.parse(read("package.json"));
  for (const dependency of [
    "@mantine/dropzone",
    "@mantine/form",
    "@mantine/carousel",
    "embla-carousel-react",
    "swiper",
  ]) {
    assert.equal(packageJson.dependencies?.[dependency], undefined);
  }
  assert.ok(packageJson.dependencies.d3);
  assert.ok(packageJson.devDependencies.dotenv);
  assert.ok(read("kubb.config.ts").includes("dotenv"));
  assert.ok(read("src/app/layout.tsx").includes("@mantine/core/styles.css"));
  assert.ok(!read("src/app/layout.tsx").includes("@mantine/carousel/styles.css"));
});

test("checkout and legal Stage 2 wiring remains unchanged", () => {
  const checkout = read("src/widgets/pages/CheckoutPage/sections/CheckoutPaymentCard.tsx");
  const legal = read("src/widgets/pages/shared/legal/legal.data.ts");
  assert.match(checkout, /CheckoutLegalNotice/);
  assert.match(legal, /NOS VPN/);
});
