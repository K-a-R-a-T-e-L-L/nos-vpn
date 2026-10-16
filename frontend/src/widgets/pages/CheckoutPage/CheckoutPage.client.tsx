"use client";

import { Alert, Button } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { subscriptionUserControllerCreateUserSubscription } from "@/shared/api/.generated/clients/subscriptionsController/subscriptionUserControllerCreateUserSubscription";
import { subscriptionUserControllerGetUserSubscription } from "@/shared/api/.generated/clients/subscriptionsController/subscriptionUserControllerGetUserSubscription";
import { subscriptionUserControllerSubscriptionAction } from "@/shared/api/.generated/clients/subscriptionsController/subscriptionUserControllerSubscriptionAction";
import { useAuthSession } from "@/shared/lib/auth/AuthSessionProvider";
import { getStoredReferralCode } from "@/shared/lib/referral/referral";
import { PageSection } from "@/shared/ui/PageSection/PageSection";
import {
  claimReferralCode,
  extractPaymentUrl,
  getEffectivePromoDevicesLabel,
  getEffectivePromoDurationDays,
  getErrorMessage,
  getPlanDescription,
  getPlanTitle,
  PageLoader,
  PromoPreview,
  usePlansQuery,
  validatePromoCode,
} from "@/widgets/pages/shared/account/account.client";

import {
  createPlategaCryptoPayment,
  createPlategaRecurrentAgreement,
  getCheckoutOptions,
} from "./checkout-api";
import { createRecurrentIdempotencyKeyState } from "./checkout-intent";
import CheckoutPaymentCard from "./sections/CheckoutPaymentCard";
import CheckoutSuccessCard from "./sections/CheckoutSuccessCard";
import {
  getCheckoutErrorMessage,
  runSingleFlight,
  runCheckoutPaymentFlow,
} from "./checkout-flow";
import {
  getAvailableCheckoutMethods,
  hasUnavailableExternalCheckout,
  type CheckoutMethod,
} from "./checkout-methods";

type CheckoutResult = {
  paymentUrl: string | null;
  paidWithPromo: boolean;
};

export default function CheckoutPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isReady } = useAuthSession();
  const planId = searchParams.get("planId");
  const plansQuery = usePlansQuery();
  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: () => subscriptionUserControllerGetUserSubscription(),
    enabled: isReady && isAuthenticated,
  });
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<PromoPreview | null>(null);
  const [activationSuccess, setActivationSuccess] = useState(false);
  const recurrentIdempotencyKeyRef = useRef(
    createRecurrentIdempotencyKeyState(() => globalThis.crypto.randomUUID()),
  );
  const checkoutInFlightRef = useRef<Promise<CheckoutResult> | null>(null);
  const checkoutNextUrl = planId ? `/checkout?planId=${planId}` : "/tariffs";

  const plan = useMemo(
    () => plansQuery.data?.data.find((item) => item.id === planId) ?? null,
    [planId, plansQuery.data?.data],
  );
  const checkoutOptionsQuery = useQuery({
    queryKey: ["checkout-options", planId],
    queryFn: () => getCheckoutOptions(planId || ""),
    enabled: isReady && isAuthenticated && Boolean(planId) && Boolean(plan),
  });
  const checkoutAmount = appliedPromo?.finalAmount ?? plan?.amount ?? 0;
  const availableMethods = getAvailableCheckoutMethods(checkoutOptionsQuery.data).filter(
    (method) =>
      !(
        method === "RECURRENT" &&
        appliedPromo &&
        !checkoutOptionsQuery.data?.oneTime.available
      ),
  );
  const noExternalMethods = hasUnavailableExternalCheckout(
    checkoutAmount,
    availableMethods,
    Boolean(checkoutOptionsQuery.data),
  );

  useEffect(() => {
    // Reset form state when navigation selects a different checkout operation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPromoCode("");
    setAppliedPromo(null);
    setError(null);
    setActivationSuccess(false);
    recurrentIdempotencyKeyRef.current.reset();
  }, [planId]);

  useEffect(() => {
    if (!isReady || isAuthenticated) {
      return;
    }

    router.replace(`/login?next=${encodeURIComponent(checkoutNextUrl)}`);
  }, [checkoutNextUrl, isAuthenticated, isReady, router]);

  const validatePromoMutation = useMutation({
    mutationFn: async () => {
      const code = promoCode.trim();
      if (!code) {
        throw new Error("Введите промокод.");
      }

      return validatePromoCode({ code, planId: planId || undefined });
    },
    onSuccess: (promo) => {
      setAppliedPromo(promo);
      setPromoCode(promo.code);
      setError(null);
      recurrentIdempotencyKeyRef.current.reset();
    },
    onError: (promoError) => {
      setAppliedPromo(null);
      setError(getErrorMessage(promoError));
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: (requestedMethod: CheckoutMethod) =>
      runSingleFlight(checkoutInFlightRef, async () => {
        if (!planId) {
          throw new Error("Тариф не выбран");
        }

        const method = checkoutAmount <= 0 ? "ONE_TIME" : requestedMethod;
        if (checkoutAmount > 0 && !availableMethods.includes(method)) {
          throw new Error("Выберите доступный способ оплаты.");
        }

        // A promo keeps the same SBP button in the UI, but must never create a
        // discounted recurrent agreement. In that case SBP deliberately uses
        // the ordinary one-time Platega checkout underneath.
        const executionMethod: CheckoutMethod =
          method === "RECURRENT" && appliedPromo ? "ONE_TIME" : method;

        const storedReferralCode = getStoredReferralCode();
        if (storedReferralCode) {
          try {
            await claimReferralCode(storedReferralCode);
          } catch {
            // Payment flow should not fail only because attribution could not be claimed in advance.
          }
        }

        if (subscriptionQuery.isError) {
          throw subscriptionQuery.error;
        }

        const actionResponse = await runCheckoutPaymentFlow({
          subscriptionExists: Boolean(subscriptionQuery.data),
          planId,
          promoCode: appliedPromo?.code,
          createSubscription: async () => {
            const created =
              await subscriptionUserControllerCreateUserSubscription({
                planId,
              });
            queryClient.setQueryData(["subscription"], created);
          },
          createPaymentAction: (payload) => {
            if (executionMethod === "CRYPTO") {
              return createPlategaCryptoPayment({ planId: payload.planId, promoCode: payload.promoCode });
            }
            if (executionMethod === "RECURRENT") {
              return createPlategaRecurrentAgreement({
                planId: payload.planId,
                idempotencyKey: recurrentIdempotencyKeyRef.current.getOrCreate({
                  planId: payload.planId,
                  promoCode: null,
                }),
              });
            }
            return subscriptionUserControllerSubscriptionAction(payload);
          },
        });
        const paymentUrl = extractPaymentUrl(actionResponse);
        const paymentPayload = actionResponse as { paidWithPromo?: boolean };

        if (!paymentUrl && !paymentPayload?.paidWithPromo) {
          throw new Error("Backend не вернул ссылку на оплату");
        }

        return {
          paymentUrl,
          paidWithPromo: Boolean(paymentPayload?.paidWithPromo),
        };
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["access"] });

      if (result.paidWithPromo) {
        setActivationSuccess(true);
        setError(null);
        return;
      }

      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
      }
    },
    onError: (mutationError) => setError(getCheckoutErrorMessage(mutationError)),
  });

  if (!isReady || plansQuery.isLoading || subscriptionQuery.isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <PageLoader />;
  }

  if (!planId || !plan) {
    return (
      <PageSection>
        <Alert color="red" icon={<IconAlertCircle size={18} />}>
          Тариф не выбран или не найден. Выберите тариф на странице тарифов.
        </Alert>
        <Button component="a" href="/tariffs" mt="md">
          Перейти к тарифам
        </Button>
      </PageSection>
    );
  }

  if (checkoutOptionsQuery.isLoading && checkoutAmount > 0) {
    return <PageLoader />;
  }

  if (activationSuccess) {
    return (
      <PageSection size="sm">
        <CheckoutSuccessCard promoCode={appliedPromo?.code} planTitle={getPlanTitle(plan)} />
      </PageSection>
    );
  }

  return (
    <PageSection size="sm">
      <CheckoutPaymentCard
        planTitle={getPlanTitle(plan)}
        planDescription={getPlanDescription(plan)}
        planAmount={plan.amount}
        durationDays={getEffectivePromoDurationDays(plan, appliedPromo)}
        devicesLabel={getEffectivePromoDevicesLabel(plan, appliedPromo)}
        checkoutAmount={checkoutAmount}
        promoCode={promoCode}
        appliedPromo={appliedPromo}
        errorText={
          error ||
          (checkoutOptionsQuery.isError && checkoutAmount > 0
            ? "Способы оплаты временно недоступны. Попробуйте позже."
            : noExternalMethods
              ? "Способы оплаты временно недоступны. Попробуйте позже."
              : null)
        }
        isValidatingPromo={validatePromoMutation.isPending}
        isCheckoutPending={checkoutMutation.isPending}
        pendingMethod={checkoutMutation.isPending ? (checkoutMutation.variables ?? null) : null}
        onPromoCodeChange={(value) => {
          setPromoCode(value);
          setAppliedPromo(null);
          setError(null);
          recurrentIdempotencyKeyRef.current.reset();
        }}
        onValidatePromo={() => validatePromoMutation.mutate()}
        availableMethods={availableMethods}
        onCheckout={(method) => checkoutMutation.mutate(method)}
      />
    </PageSection>
  );
}
