export type PaymentCreatePayload = {
  action: "payment.create";
  planId: string;
  promoCode?: string;
};

export function getCheckoutErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const typedError = error as Error & {
      payload?: { message?: string | string[] };
      status?: number;
    };
    const message = Array.isArray(typedError.payload?.message)
      ? typedError.payload.message.join(", ")
      : typedError.payload?.message;
    const normalizedMessage = error.message.toLowerCase();

    if (message === "PAYMENT_PROVIDER_REJECTED") {
      return "Платёжный сервис отклонил создание платежа. Оплата не была списана. Попробуйте позже или обратитесь в поддержку.";
    }

    if (
      (typeof typedError.status === "number" && typedError.status >= 500) ||
      normalizedMessage.includes("failed to fetch") ||
      normalizedMessage.includes("request failed with status")
    ) {
      return "Сервер временно не смог обработать запрос. Попробуйте ещё раз.";
    }

    return message || error.message || "Не удалось выполнить запрос.";
  }

  return "Не удалось выполнить запрос.";
}

export async function runCheckoutPaymentFlow<TResult>(input: {
  subscriptionExists: boolean;
  planId: string;
  promoCode?: string;
  createSubscription: () => Promise<unknown>;
  createPaymentAction: (payload: PaymentCreatePayload) => Promise<TResult>;
}): Promise<TResult> {
  if (!input.subscriptionExists) {
    await input.createSubscription();
  }

  return input.createPaymentAction({
    action: "payment.create",
    planId: input.planId,
    ...(input.promoCode ? { promoCode: input.promoCode } : {}),
  });
}

export function createSingleFlight<TResult>(
  operation: () => Promise<TResult>,
): () => Promise<TResult> {
  const state: { current: Promise<TResult> | null } = { current: null };

  return () => runSingleFlight(state, operation);
}

export function runSingleFlight<TResult>(
  state: { current: Promise<TResult> | null },
  operation: () => Promise<TResult>,
): Promise<TResult> {
  if (state.current) {
    return state.current;
  }

  const wrapped = operation().finally(() => {
    if (state.current === wrapped) {
      state.current = null;
    }
  });
  state.current = wrapped;
  return wrapped;
}
