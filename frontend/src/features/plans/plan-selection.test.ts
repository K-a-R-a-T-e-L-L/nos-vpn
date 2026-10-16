import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPlanPrice,
  getRecommendedDevices,
  getSelectedPlan,
} from "./plan-selection.ts";

const catalog = {
  durations: [
    {
      periodDays: 30,
      months: 1,
      label: "1 месяц",
      startingPriceRub: 199,
      savingsPercent: null,
    },
    {
      periodDays: 90,
      months: 3,
      label: "3 месяца",
      startingPriceRub: 499,
      savingsPercent: 16,
    },
  ],
  rows: [
    {
      devicesLimit: 1,
      devicesLabel: "1 устройство",
      plans: [
        {
          id: "one-30",
          name: "1 / 30",
          period: 30,
          amount: 199,
          isActive: true,
          devicesLimit: 1,
          savingsPercent: null,
        },
        null,
      ],
    },
    {
      devicesLimit: 2,
      devicesLabel: "2 устройства",
      plans: [
        {
          id: "two-30",
          name: "2 / 30",
          period: 30,
          amount: 299,
          isActive: true,
          devicesLimit: 2,
          savingsPercent: null,
        },
        {
          id: "two-90",
          name: "2 / 90",
          period: 90,
          amount: 749,
          isActive: true,
          devicesLimit: 2,
          savingsPercent: 16,
        },
      ],
    },
  ],
};

test("plan selection preserves the recommended row and duration matrix lookup", () => {
  assert.equal(getRecommendedDevices(catalog), 2);
  assert.equal(getSelectedPlan(catalog, 90, 2)?.id, "two-90");
  assert.equal(getSelectedPlan(catalog, 90, 1), null);
  assert.equal(getSelectedPlan(catalog, 365, 2), null);
});

test("plan price formatting remains Russian ruble output", () => {
  assert.equal(formatPlanPrice(12_345), "12 345 ₽");
});
