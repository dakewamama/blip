"use client";

import { PrivyProvider, useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type CustodyAccount, type CustodyStatus, type CustodyTradeResult, type CustodyWithdrawResult } from "./api";
import { brand } from "./brand";

/**
 * Custody: the app holds each user's Solana wallet for them.
 *
 * With NEXT_PUBLIC_PRIVY_APP_ID set, sign-in is a real Privy email/OAuth login,
 * the API creates (once) and controls a wallet for that user, and balances,
 * trades and withdrawals are on-chain. Without it the app runs as a labelled
 * demo — the same screens over a simulated balance — so it still works with no
 * accounts configured.
 */
// Each brand is normally its own deploy with its own NEXT_PUBLIC_PRIVY_APP_ID.
// The scoped names let one local .env.local give each brand a different Privy
// app; they are spelled out because Next only inlines literal env references.
const SCOPED_APP_IDS: Record<string, string | undefined> = {
  blip: process.env.NEXT_PUBLIC_PRIVY_APP_ID_BLIP,
  flick: process.env.NEXT_PUBLIC_PRIVY_APP_ID_FLICK,
  kite: process.env.NEXT_PUBLIC_PRIVY_APP_ID_KITE,
};
export const PRIVY_APP_ID = SCOPED_APP_IDS[brand.id] || process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

type TradeBody = Parameters<typeof api.custody.trade>[1];
type WithdrawBody = Parameters<typeof api.custody.withdraw>[1];

export type CustodyCtx = {
  /** Custodial mode. False = demo build. */
  enabled: boolean;
  /** False until the auth SDK has restored (or ruled out) a session. */
  ready: boolean;
  authed: boolean;
  /** Privy user ID of the signed-in person. */
  userId: string | null;
  email: string | null;
  status: CustodyStatus | null;
  /** The held wallet and what is in it. Null until first loaded. */
  account: CustodyAccount | null;
  error: string | null;
  refresh: () => Promise<void>;
  trade: (body: TradeBody) => Promise<CustodyTradeResult>;
  withdraw: (body: WithdrawBody) => Promise<CustodyWithdrawResult>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  oauth: (provider: "google" | "apple") => Promise<void>;
  signOut: () => Promise<void>;
};

const notCustodial = () => Promise.reject(new Error("Custody is not configured for this build"));

const DEMO: CustodyCtx = {
  enabled: false,
  ready: true,
  authed: false,
  userId: null,
  email: null,
  status: null,
  account: null,
  error: null,
  refresh: async () => {},
  trade: notCustodial,
  withdraw: notCustodial,
  // The demo accepts any address and any six digits; nothing is sent.
  sendCode: async () => {},
  verifyCode: async () => {},
  oauth: async () => {},
  signOut: async () => {},
};

const CustodyContext = createContext<CustodyCtx>(DEMO);

export function CustodyProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <CustodyContext.Provider value={DEMO}>{children}</CustodyContext.Provider>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "apple"],
        appearance: { theme: "dark", accentColor: brand.accent as `#${string}` },
        // The API holds the wallet. Users never get a Privy embedded wallet of their own.
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      <LiveCustody>{children}</LiveCustody>
    </PrivyProvider>
  );
}

function LiveCustody({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { initOAuth } = useLoginWithOAuth();

  const [status, setStatus] = useState<CustodyStatus | null>(null);
  const [account, setAccount] = useState<CustodyAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);

  const token = useCallback(async () => {
    const t = await getAccessToken();
    if (!t) throw new Error("Session expired — sign in again");
    return t;
  }, [getAccessToken]);

  useEffect(() => {
    api.custody.status().then(setStatus, () => setStatus(null));
  }, []);

  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const next = await api.custody.account(await token());
      setAccount(next);
      setStatus(next);
      setError(null);
    } catch (e) {
      // Keep the last snapshot on screen; say why it is not updating.
      setError(e instanceof Error ? e.message : "Could not load your wallet");
    } finally {
      loading.current = false;
    }
  }, [token]);

  // Load on sign-in (this is also what creates the wallet), then keep it fresh.
  useEffect(() => {
    if (!ready || !authenticated) {
      setAccount(null);
      return;
    }
    void refresh();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [ready, authenticated, refresh]);

  const value = useMemo<CustodyCtx>(
    () => ({
      enabled: true,
      ready,
      authed: ready && authenticated,
      userId: user?.id ?? null,
      email: user?.email?.address ?? user?.google?.email ?? user?.apple?.email ?? null,
      status,
      account,
      error,
      refresh,
      trade: async (body) => {
        const result = await api.custody.trade(await token(), body);
        void refresh();
        return result;
      },
      withdraw: async (body) => {
        const result = await api.custody.withdraw(await token(), body);
        void refresh();
        return result;
      },
      sendCode: (email) => sendCode({ email }),
      verifyCode: (code) => loginWithCode({ code }),
      oauth: (provider) => initOAuth({ provider }),
      signOut: async () => {
        await logout();
        setAccount(null);
      },
    }),
    [ready, authenticated, user, status, account, error, refresh, token, sendCode, loginWithCode, initOAuth, logout],
  );

  return <CustodyContext.Provider value={value}>{children}</CustodyContext.Provider>;
}

export function useCustody(): CustodyCtx {
  return useContext(CustodyContext);
}
