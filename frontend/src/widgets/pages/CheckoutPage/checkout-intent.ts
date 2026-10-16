export type RecurrentCheckoutIntent = {
  planId: string;
  promoCode?: string | null;
};

export function createRecurrentIdempotencyKeyState(generateKey: () => string) {
  let activeIntent: string | null = null;
  let key: string | null = null;

  return {
    getOrCreate(intent: RecurrentCheckoutIntent) {
      const nextIntent = `${intent.planId}:${intent.promoCode || ""}`;
      if (activeIntent !== nextIntent) {
        activeIntent = nextIntent;
        key = null;
      }
      key ??= generateKey();
      return key;
    },
    reset() {
      activeIntent = null;
      key = null;
    },
  };
}
