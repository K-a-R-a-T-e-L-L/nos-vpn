"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { userControllerLogin } from "@/shared/api/.generated/clients/userController/userControllerLogin";
import { userControllerRegister } from "@/shared/api/.generated/clients/userController/userControllerRegister";
import {
  getAccessToken,
  refreshAccessTokenPair,
  setAccessToken,
  subscribeAccessToken,
} from "@/shared/api/client";

const TOKEN_REFRESH_INTERVAL_MS = 3 * 60 * 1000 + 45 * 1000;

type AuthCredentials = {
  email: string;
  password: string;
};

type AuthSessionContextValue = {
  accessToken: string | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (credentials: AuthCredentials) => Promise<void>;
  register: (credentials: AuthCredentials) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [accessToken, setSessionAccessToken] = useState<string | null>(() => getAccessToken());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeAccessToken(setSessionAccessToken);

    refreshAccessTokenPair()
      .then((token) => setSessionAccessToken(token))
      .catch(() => {
        setAccessToken(null);
        setSessionAccessToken(null);
      })
      .finally(() => setIsReady(true));

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      refreshAccessTokenPair()
        .then((token) => setSessionAccessToken(token))
        .catch(() => {
          setAccessToken(null);
          setSessionAccessToken(null);
        });
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [accessToken]);

  const login = useCallback(async (credentials: AuthCredentials) => {
    const response = await userControllerLogin(credentials);
    setAccessToken(response.accessToken);
    setSessionAccessToken(response.accessToken);
  }, []);

  const register = useCallback(async (credentials: AuthCredentials) => {
    const response = await userControllerRegister(credentials);
    setAccessToken(response.accessToken);
    setSessionAccessToken(response.accessToken);
  }, []);

  const refresh = useCallback(async () => {
    const token = await refreshAccessTokenPair();
    setSessionAccessToken(token);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setSessionAccessToken(null);
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      accessToken,
      isAuthenticated: Boolean(accessToken),
      isReady,
      login,
      register,
      logout,
      refresh,
    }),
    [accessToken, isReady, login, logout, refresh, register],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const value = useContext(AuthSessionContext);

  if (!value) {
    throw new Error("useAuthSession must be used inside AuthSessionProvider");
  }

  return value;
}
