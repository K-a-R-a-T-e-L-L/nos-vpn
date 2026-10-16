export type CheckoutMethod = "ONE_TIME" | "CRYPTO" | "RECURRENT";
export type RecurrentCadence = "MONTHLY" | "YEARLY" | null;

export type CheckoutOptions = {
  planId: string;
  oneTime: { available: boolean };
  crypto: { available: boolean };
  recurrent: {
    available: boolean;
    eligible: boolean;
    cadence: RecurrentCadence;
  };
};

export function getAvailableCheckoutMethods(
  options: Omit<CheckoutOptions, "planId"> | null | undefined,
) {
  if (!options) return [] as CheckoutMethod[];

  return ([
    options.oneTime.available ? "ONE_TIME" : null,
    options.recurrent.available && options.recurrent.eligible
      ? "RECURRENT"
      : null,
    options.crypto.available ? "CRYPTO" : null,
  ] as const).filter((method): method is CheckoutMethod => method !== null);
}

export function hasUnavailableExternalCheckout(
  amount: number,
  methods: CheckoutMethod[],
  optionsLoaded: boolean,
) {
  return optionsLoaded && amount > 0 && methods.length === 0;
}
