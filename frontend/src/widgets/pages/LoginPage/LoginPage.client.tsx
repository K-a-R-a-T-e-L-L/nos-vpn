"use client";

import { SimpleGrid } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { setAccessToken } from "@/shared/api/client";
import { useAuthSession } from "@/shared/lib/auth/AuthSessionProvider";
import { getStoredReferralCode } from "@/shared/lib/referral/referral";
import {
  claimReferralCode,
  completeTelegramAuth,
  createTelegramAuthLink,
  getAuthErrorMessage,
  getErrorMessage,
  openTelegramUrl,
  readStoredTelegramAuthRequest,
  sanitizeNextPath,
  TELEGRAM_AUTH_STORAGE_KEY,
  TELEGRAM_AUTH_TIMEOUT_MS,
  writeStoredTelegramAuthRequest,
} from "@/widgets/pages/shared/account/account.client";

import LoginAuthCard from "./sections/LoginAuthCard";
import LoginIntroCard from "./sections/LoginIntroCard";
import styles from "./LoginPage.module.css";

const TELEGRAM_AUTH_REFRESH_BUFFER_MS = 15_000;

type PreparedTelegramAuth = {
  linkUrl: string;
  requestToken: string;
  expiresAt: number;
};

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isReady, login, register } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramRequestToken, setTelegramRequestToken] = useState<
    string | null
  >(null);
  const [telegramExpiresAt, setTelegramExpiresAt] = useState<number | null>(
    null,
  );
  const [telegramWaiting, setTelegramWaiting] = useState(false);
  const [preparedTelegramAuth, setPreparedTelegramAuth] =
    useState<PreparedTelegramAuth | null>(null);
  const [isPreparingTelegramAuth, setIsPreparingTelegramAuth] = useState(false);
  const prepareTelegramAuthPromiseRef =
    useRef<Promise<PreparedTelegramAuth> | null>(null);
  const nextUrl = sanitizeNextPath(searchParams.get("next"), "/dashboard");

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await register({ email, password });
      }

      const storedReferralCode = getStoredReferralCode();
      if (storedReferralCode) {
        try {
          await claimReferralCode(storedReferralCode);
        } catch {
          // Global tracker retries invalid/late referral binding.
        }
      }
    },
    onSuccess: () => router.replace(nextUrl),
    onError: (mutationError) =>
      setError(getAuthErrorMessage(mutationError, mode)),
  });

  useEffect(() => {
    if (!isReady || !isAuthenticated) {
      return;
    }

    router.replace(nextUrl);
  }, [isAuthenticated, isReady, nextUrl, router]);

  useEffect(() => {
    const stored = readStoredTelegramAuthRequest();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTelegramRequestToken(stored.requestToken);
      setTelegramExpiresAt(stored.expiresAt);
      setTelegramWaiting(true);
    }
  }, []);

  const prepareTelegramAuth = useCallback(
    async (force = false) => {
      const hasFreshPreparedToken =
        preparedTelegramAuth &&
        preparedTelegramAuth.expiresAt >
          Date.now() + TELEGRAM_AUTH_REFRESH_BUFFER_MS;

      if (!force && hasFreshPreparedToken) {
        return preparedTelegramAuth;
      }

      if (prepareTelegramAuthPromiseRef.current) {
        return prepareTelegramAuthPromiseRef.current;
      }

      setIsPreparingTelegramAuth(true);

      const promise = createTelegramAuthLink()
        .then((response) => {
          const prepared = {
            linkUrl: response.linkUrl,
            requestToken: response.requestToken,
            expiresAt: new Date(response.expiresAt).getTime(),
          } satisfies PreparedTelegramAuth;

          setPreparedTelegramAuth(prepared);
          setTelegramError(null);
          return prepared;
        })
        .finally(() => {
          setIsPreparingTelegramAuth(false);
          prepareTelegramAuthPromiseRef.current = null;
        });

      prepareTelegramAuthPromiseRef.current = promise;
      return promise;
    },
    [preparedTelegramAuth],
  );

  useEffect(() => {
    if (telegramWaiting) {
      return;
    }

    const hasFreshPreparedToken =
      preparedTelegramAuth &&
      preparedTelegramAuth.expiresAt >
        Date.now() + TELEGRAM_AUTH_REFRESH_BUFFER_MS;

    if (hasFreshPreparedToken) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void prepareTelegramAuth().catch((prepareError) => {
      setTelegramError(getErrorMessage(prepareError));
    });
  }, [prepareTelegramAuth, preparedTelegramAuth, telegramWaiting]);

  useEffect(() => {
    if (!preparedTelegramAuth || telegramWaiting) {
      return undefined;
    }

    const refreshDelay = Math.max(
      5_000,
      preparedTelegramAuth.expiresAt -
        Date.now() -
        TELEGRAM_AUTH_REFRESH_BUFFER_MS,
    );

    const timeoutId = window.setTimeout(() => {
      void prepareTelegramAuth(true).catch((prepareError) => {
        setTelegramError(getErrorMessage(prepareError));
      });
    }, refreshDelay);

    return () => window.clearTimeout(timeoutId);
  }, [prepareTelegramAuth, preparedTelegramAuth, telegramWaiting]);

  useEffect(() => {
    if (!telegramRequestToken || !telegramWaiting || !telegramExpiresAt) {
      return undefined;
    }

    let stopped = false;

    const expire = () => {
      window.sessionStorage.removeItem(TELEGRAM_AUTH_STORAGE_KEY);
      setTelegramWaiting(false);
      setTelegramRequestToken(null);
      setTelegramExpiresAt(null);
      setTelegramError(
        "Время входа через Telegram истекло. Нажмите кнопку еще раз.",
      );
    };

    if (telegramExpiresAt <= Date.now()) {
      expire();
      return undefined;
    }

    const checkStatus = async () => {
      if (Date.now() >= telegramExpiresAt) {
        expire();
        return;
      }

      try {
        const result = await completeTelegramAuth(telegramRequestToken);
        if (stopped || result.status !== "confirmed" || !result.accessToken) {
          return;
        }

        window.sessionStorage.removeItem(TELEGRAM_AUTH_STORAGE_KEY);
        setAccessToken(result.accessToken);
        setTelegramWaiting(false);
        setTelegramRequestToken(null);
        setTelegramExpiresAt(null);

        const storedReferralCode = getStoredReferralCode();
        if (storedReferralCode) {
          try {
            await claimReferralCode(storedReferralCode);
          } catch {
            // Global tracker retries invalid/late referral binding.
          }
        }

        router.replace(nextUrl);
      } catch (statusError) {
        if (!stopped) {
          setTelegramWaiting(false);
          setTelegramRequestToken(null);
          setTelegramExpiresAt(null);
          setTelegramError(getErrorMessage(statusError));
          window.sessionStorage.removeItem(TELEGRAM_AUTH_STORAGE_KEY);
        }
      }
    };

    void checkStatus();
    const intervalId = window.setInterval(checkStatus, 2000);
    const timeoutId = window.setTimeout(
      expire,
      Math.max(0, telegramExpiresAt - Date.now()),
    );

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [
    nextUrl,
    router,
    telegramExpiresAt,
    telegramRequestToken,
    telegramWaiting,
  ]);

  const telegramMutation = useMutation({
    mutationFn: async () => {
      const prepared =
        preparedTelegramAuth && preparedTelegramAuth.expiresAt > Date.now()
          ? preparedTelegramAuth
          : await prepareTelegramAuth(true);

      return prepared;
    },
    onSuccess: (prepared) => {
      const expiresAt = Math.min(
        prepared.expiresAt,
        Date.now() + TELEGRAM_AUTH_TIMEOUT_MS,
      );
      setTelegramError(null);
      setTelegramRequestToken(prepared.requestToken);
      setTelegramExpiresAt(expiresAt);
      setTelegramWaiting(true);
      writeStoredTelegramAuthRequest(prepared.requestToken, expiresAt);
      openTelegramUrl(prepared.linkUrl, "new-tab");
    },
    onError: (mutationError) =>
      setTelegramError(getErrorMessage(mutationError)),
  });

  return (
    <section className={styles.loginSection}>
      <SimpleGrid
        className={styles.loginGrid}
        cols={{ base: 1, md: 2 }}
        spacing="xl"
        verticalSpacing="xl"
      >
        <LoginIntroCard
          telegramWaiting={telegramWaiting}
          telegramError={telegramError}
          isTelegramPending={
            telegramMutation.isPending || isPreparingTelegramAuth
          }
          onTelegramLogin={() => telegramMutation.mutate()}
          onCancelTelegramAuth={() => {
            window.sessionStorage.removeItem(TELEGRAM_AUTH_STORAGE_KEY);
            setTelegramWaiting(false);
            setTelegramRequestToken(null);
            setTelegramExpiresAt(null);
            setTelegramError(null);
          }}
        />

        <LoginAuthCard
          mode={mode}
          email={email}
          password={password}
          error={error}
          isPending={mutation.isPending}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            setError(null);
          }}
          onEmailChange={(value) => {
            setEmail(value);
            setError(null);
          }}
          onPasswordChange={(value) => {
            setPassword(value);
            setError(null);
          }}
          onSubmit={() => mutation.mutate()}
        />
      </SimpleGrid>
    </section>
  );
}
