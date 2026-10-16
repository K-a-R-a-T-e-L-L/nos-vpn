import client from "@/shared/api/client";

import type { CheckoutOptions } from "./checkout-methods";

type CreateCryptoPaymentInput = {
  planId: string;
  promoCode?: string;
};

type CreateRecurrentAgreementInput = {
  planId: string;
  idempotencyKey: string;
};

export async function getCheckoutOptions(planId: string): Promise<CheckoutOptions> {
  const response = await client<CheckoutOptions>({
    method: "GET",
    url: `/payments/checkout-options/${encodeURIComponent(planId)}`,
  });
  return response.data;
}

export async function createPlategaCryptoPayment(input: CreateCryptoPaymentInput) {
  const response = await client({
    method: "POST",
    url: "/payments/platega/crypto",
    data: {
      planId: input.planId,
      ...(input.promoCode ? { promoCode: input.promoCode } : {}),
    },
  });
  return response.data;
}

/** Keep recurrent idempotency and the provider consent flag at the HTTP boundary. */
export async function createPlategaRecurrentAgreement(input: CreateRecurrentAgreementInput) {
  const response = await client<{ redirect?: string | null }>({
    method: "POST",
    url: "/payments/platega/recurrent",
    data: { planId: input.planId, consent: true },
    headers: { "Idempotency-Key": input.idempotencyKey },
  });
  return {
    ...response.data,
    redirectUrl: response.data.redirect || null,
  };
}
