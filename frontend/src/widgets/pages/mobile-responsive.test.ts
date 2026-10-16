import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("global mobile foundation exposes overflow and enforces 44px controls", () => {
  const css = source("../../app/globals.css");

  assert.doesNotMatch(css, /body\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /\.mantine-Button-root\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.mantine-Input-input[\s\S]*?min-height:\s*44px/);
  assert.match(
    css,
    /\.mantine-Burger-root[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/,
  );
});

test("narrow compound controls stack instead of forcing intrinsic widths", () => {
  const setup = source("./SetupPage/SetupPage.module.css");
  const access = source("../../shared/ui/AccessLinkCard/AccessLinkCard.tsx");
  const checkout = source("./CheckoutPage/sections/CheckoutPaymentCard.tsx");
  const telegram = source("./DashboardPage/sections/DashboardTelegramCard.tsx");

  assert.match(
    setup,
    /@media \(max-width: 36em\)[\s\S]*?\.stepsColumns[\s\S]*?grid-template-columns:\s*1fr/,
  );
  const stackedGrid = /cols=\{\{\s*base: 1,\s*xs: 2\s*\}\}/;
  assert.match(access, stackedGrid);
  assert.match(checkout, stackedGrid);
  assert.match(telegram, stackedGrid);
});

test("mobile navigation and footer links expose touch-sized targets", () => {
  const header = source("../layout/Header/Header.module.css");
  const footer = source("../layout/Footer/Footer.module.css");

  assert.match(header, /\.drawerLink\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(footer, /\.footerLink\s*\{[\s\S]*?min-height:\s*44px/);
});
