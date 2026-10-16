import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createSingleFlight,
  getCheckoutErrorMessage,
  runCheckoutPaymentFlow,
} from "./checkout-flow.ts";
import {
  getAvailableCheckoutMethods,
  hasUnavailableExternalCheckout,
} from "./checkout-methods.ts";
import { createRecurrentIdempotencyKeyState } from "./checkout-intent.ts";

test("an existing subscription goes directly to payment.create", async () => {
  let creates = 0;
  const actions: unknown[] = [];

  await runCheckoutPaymentFlow({
    subscriptionExists: true,
    planId: "plan-1",
    promoCode: "PROMO",
    createSubscription: async () => {
      creates += 1;
    },
    createPaymentAction: async (payload) => {
      actions.push(payload);
      return { confirmationUrl: "https://pay.example/1" };
    },
  });

  assert.equal(creates, 0);
  assert.deepEqual(actions, [
    { action: "payment.create", planId: "plan-1", promoCode: "PROMO" },
  ]);
  assert.equal(
    "savePaymentMethod" in (actions[0] as Record<string, unknown>),
    false,
  );
  assert.equal("autoRenew" in (actions[0] as Record<string, unknown>), false);
});

test("provider rejection and temporary failures have safe messages", () => {
  const rejected = Object.assign(new Error("raw provider body"), {
    status: 422,
    payload: { message: "PAYMENT_PROVIDER_REJECTED" },
  });
  assert.equal(
    getCheckoutErrorMessage(rejected),
    "Платёжный сервис отклонил создание платежа. Оплата не была списана. Попробуйте позже или обратитесь в поддержку.",
  );
  assert.doesNotMatch(getCheckoutErrorMessage(rejected), /raw provider body/);

  const unavailable = Object.assign(new Error("request failed"), {
    status: 503,
  });
  assert.equal(
    getCheckoutErrorMessage(unavailable),
    "Сервер временно не смог обработать запрос. Попробуйте ещё раз.",
  );
});

test("a missing subscription is created exactly once before payment action", async () => {
  const calls: string[] = [];

  await runCheckoutPaymentFlow({
    subscriptionExists: false,
    planId: "plan-1",
    createSubscription: async () => {
      calls.push("create");
    },
    createPaymentAction: async () => {
      calls.push("action");
      return {};
    },
  });

  assert.deepEqual(calls, ["create", "action"]);
});

test("subscription creation failure stops payment action", async () => {
  let actions = 0;
  const expected = new Error("create failed");

  await assert.rejects(
    runCheckoutPaymentFlow({
      subscriptionExists: false,
      planId: "plan-1",
      createSubscription: async () => {
        throw expected;
      },
      createPaymentAction: async () => {
        actions += 1;
        return {};
      },
    }),
    expected,
  );
  assert.equal(actions, 0);
});

test("single-flight returns one operation for concurrent clicks", async () => {
  let operations = 0;
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = createSingleFlight(async () => {
    operations += 1;
    await blocker;
    return "done";
  });

  const first = run();
  const second = run();
  assert.equal(first, second);
  assert.equal(operations, 1);
  release();
  assert.equal(await first, "done");
  assert.equal(await second, "done");
});

test("checkout methods expose every server-available production choice", () => {
  const allMethods = {
    oneTime: { available: true },
    crypto: { available: true },
    recurrent: { available: true, eligible: true, cadence: "MONTHLY" as const },
  };
  assert.deepEqual(getAvailableCheckoutMethods(allMethods), [
    "ONE_TIME",
    "RECURRENT",
    "CRYPTO",
  ]);

  assert.deepEqual(
    getAvailableCheckoutMethods({
      oneTime: { available: true },
      crypto: { available: false },
      recurrent: { available: false, eligible: true, cadence: "MONTHLY" },
    }),
    ["ONE_TIME"],
  );
  assert.deepEqual(
    getAvailableCheckoutMethods({
      oneTime: { available: false },
      crypto: { available: false },
      recurrent: { available: true, eligible: false, cadence: "MONTHLY" },
    }),
    [],
  );
});

test("website renders three direct payment buttons and no recurrent confirmation UI", () => {
  const card = readFileSync(
    new URL("./sections/CheckoutPaymentCard.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("./CheckoutPage.client.tsx", import.meta.url),
    "utf8",
  );

  assert.match(card, /Оплатить через СБП/);
  assert.match(card, /Оплатить криптой/);
  assert.match(card, />\s*Оплатить \(без автосписаний\)\s*<\/Button>/);
  assert.match(card, /color="green"[\s\S]*onCheckout\("RECURRENT"\)/);
  assert.match(card, /color="blue"[\s\S]*onCheckout\("CRYPTO"\)/);
  assert.match(card, /variant="default"[\s\S]*onCheckout\("ONE_TIME"\)/);
  assert.match(
    card,
    /При оплате через СБП подключается автоматическое продление подписки посредством рекуррентных платежей\./,
  );
  assert.doesNotMatch(card, /Radio\.Group|RecurrentPaymentDisclosure|Checkbox/);
  assert.doesNotMatch(page, /recurrentConsent|reviewRecurrentPresentation|showRecurrentDisclosure/);
});

test("promo keeps the SBP presentation but maps its execution to ONE_TIME", () => {
  const page = readFileSync(
    new URL("./CheckoutPage.client.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /method === "RECURRENT" && appliedPromo \? "ONE_TIME" : method/,
  );
  assert.match(page, /getAvailableCheckoutMethods\(checkoutOptionsQuery\.data\)/);
  assert.doesNotMatch(page, /recurrentAllowed/);
});

test("only the clicked payment button owns the pending spinner", () => {
  const card = readFileSync(
    new URL("./sections/CheckoutPaymentCard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(card, /pendingMethod === "RECURRENT"/);
  assert.match(card, /pendingMethod === "CRYPTO"/);
  assert.match(card, /pendingMethod === "ONE_TIME"/);
});

test("recurrent retry keys stay stable and reset when intent changes", () => {
  let sequence = 0;
  const state = createRecurrentIdempotencyKeyState(() => `key-${++sequence}`);
  assert.equal(state.getOrCreate({ planId: "plan-1", promoCode: null }), "key-1");
  assert.equal(state.getOrCreate({ planId: "plan-1", promoCode: null }), "key-1");
  assert.equal(state.getOrCreate({ planId: "plan-2", promoCode: null }), "key-2");
  state.reset();
  assert.equal(state.getOrCreate({ planId: "plan-2", promoCode: null }), "key-3");
});

test("the handwritten recurrent adapter keeps server-required consent and the stable idempotency header", () => {
  const adapter = readFileSync(new URL("./checkout-api.ts", import.meta.url), "utf8");
  assert.match(adapter, /data: \{ planId: input\.planId, consent: true \}/);
  assert.match(adapter, /"Idempotency-Key": input\.idempotencyKey/);
});

test("positive checkout with zero external methods is unavailable, while zero promo remains activatable", () => {
  assert.equal(hasUnavailableExternalCheckout(249, [], true), true);
  assert.equal(hasUnavailableExternalCheckout(0, [], true), false);
  assert.equal(hasUnavailableExternalCheckout(249, [], false), false);
});
