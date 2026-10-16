import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRecurrentDisclosure } from "../../CheckoutPage/recurrent-disclosure.ts";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("legal pages use the service identity, version 2.1 and canonical routes", () => {
  const config = source("../../../../shared/config/legal.ts");
  const pages = source("./legal.data.ts");
  const support = source("../../../../shared/lib/links/support.ts");
  for (const value of ["Администрация сервиса NOS VPN", "10 сентября 2026 года", 'version: "2.1"', "@your_support_username"]) assert.match(config, new RegExp(value.replace(/[()]/g, "\\$&")));
  for (const route of ["/terms", "/privacy", "/refund", "/contacts"]) assert.match(config, new RegExp(route));
  assert.match(pages, /NOS VPN/);
  assert.match(pages, /VPN-доступ/);
  assert.match(pages, /Telegram-поддержка/);
  assert.doesNotMatch(pages, /mailto:|Написать по email|Email:/);
  for (const publicSource of [config, pages, support]) {
    assert.doesNotMatch(publicSource, /operatorName|operatorInn|operatorStatus|mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{10,12}\b/i);
  }
  assert.doesNotMatch(pages, /ваш сайт|тг бот|Укажите актуальную дату/i);
});

test("terms cover consent, recurrent cancellation, crypto and lawful VPN use without provider-count promises", () => {
  const pages = source("./legal.data.ts");
  for (const text of ["явном информированном согласии", "ежемесячная или ежегодная", "будущие списания", "не сокращает уже оплаченный период", "Оплата криптовалютой", "приватные ключи", "законодательство Российской Федерации", "реферальный бонус"]) assert.match(pages, new RegExp(text));
  assert.doesNotMatch(pages, /intervalCount|количество списаний|безлимитное количество|каждые 30 дней|каждые 360 дней|не подключены|если в будущем/i);
});

test("public legal copy contains no implementation jargon", () => {
  const pages = source("./legal.data.ts");
  for (const token of [/\bcheckout\b/i, /\btrial\b/i, /\bmerchant\b/i, /\bnext-charge\b/i, /\bcrypto\b/i, /\bfirst-party\b/i, /\blanding\b/i]) {
    assert.doesNotMatch(pages, token);
  }
});

test("privacy covers data, payment-partner processing, retention, security and rights without claiming card or key collection", () => {
  const pages = source("./legal.data.ts");
  for (const text of ["хеш пароля", "Platega и YooKassa", "не получает полные реквизиты банковской карты", "не требует криптовалютные приватные ключи", "Срок хранения", "Защита данных", "Права пользователя", "Telegram — сторонняя платформа"]) assert.match(pages, new RegExp(text));
});

test("checkout notice and server-gated disclosure remain future-proof", () => {
  const notice = source("../../CheckoutPage/sections/CheckoutLegalNotice.tsx");
  const component = source("../../CheckoutPage/sections/RecurrentPaymentDisclosure.tsx");
  const checkoutClient = source("../../CheckoutPage/CheckoutPage.client.tsx");
  const disclosure = buildRecurrentDisclosure({ amountRub: 249, intervalLabel: "ежемесячно" });
  assert.match(notice, /Если[\s\S]*разовый способ оплаты/);
  assert.doesNotMatch(notice, /Текущая[\s\S]*Platega/);
  assert.match(disclosure.chargeText, /249 ₽.*ежемесячно/);
  assert.match(disclosure.cancellationText, /иного прекращения платёжной подписки/);
  assert.match(disclosure.consentLabel, /регулярные списания/);
  assert.match(component, /LEGAL_ROUTES\.terms/);
  assert.match(checkoutClient, /getCheckoutOptions/);
  assert.match(checkoutClient, /createPlategaCryptoPayment/);
  assert.match(checkoutClient, /createPlategaRecurrentAgreement/);
  assert.match(component, /LEGAL_ROUTES\.terms/);
});
