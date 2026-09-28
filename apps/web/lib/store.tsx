"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PLANS, COACHES } from "./data";
import { money } from "./format";
import { buyToast, sellToast, tpToast } from "./memes";
import { api, type FeedToken, type Quote } from "./api";

/**
 * A paper position. Execution is simulated, but entry and exit are priced from
 * real backend quotes, so slippage and curve impact are the real numbers.
 */
export type Holding = {
  mint: string;
  symbol: string;
  name: string;
  /** Token art, carried from the feed so the portfolio can render the avatar. */
  imageUri?: string;
  /** USD put in. */
  usd: number;
  /** Tokens received, after fee and price impact. */
  qty: number;
  /** SOL per token actually paid. */
  entryPriceSol: number;
  tp: boolean;
};

/** Live per-token price pulled from the real feed, used to mark positions client-side. */
export type PriceInfo = { priceUsd: number; marketCapUsd: number };

/** Client-side mark: real market price × tokens held. null when the feed has no price. */
export function liveValue(holding: Holding, prices: Record<string, PriceInfo>): number | null {
  const p = prices[holding.mint];
  return p && p.priceUsd > 0 ? holding.qty * p.priceUsd : null;
}
export type ActivityRow = { title: string; amount: string; time: string; dot: string };
export type Referral = { handle: string; joinedAt: string; funded: boolean; rewardUsd: number; /** Volume this referral has traded — drives the partner commission line. */ volumeUsd?: number };

/** Flat $ paid to the referrer once an invited account funds. Shown in the UI. */
export const REFERRAL_REWARD_USD = 10;
export function referralCode(handle: string): string {
  const base = (handle || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return base ? `blip-${base}` : "";
}

export type State = {
  authed: boolean;
  mode: "signup" | "signin";
  authStep: number;
  email: string;
  code: string;
  handle: string;
  cap: number;
  fund: number;
  cash: number;
  holdings: Holding[];
  /** Optional real wallet to read on the portfolio page. Read-only. */
  walletAddress: string | null;
  activity: ActivityRow[];
  plan: string;
  coach: string;
  activePlan: string | null;
  activeCoach: string | null;
  /** People who signed up through this account's referral link. */
  referrals: Referral[];
  /** Referral code this account signed up under, if any. */
  referredBy: string | null;
};

const initialState: State = {
  authed: false,
  mode: "signup",
  authStep: 0,
  email: "",
  code: "",
  handle: "",
  cap: 250,
  fund: 500,
  cash: 0,
  holdings: [],
  walletAddress: null,
  activity: [],
  plan: "pair",
  coach: "mara",
  activePlan: null,
  activeCoach: null,
  referrals: [],
  referredBy: null,
};

type Action =
  | { type: "patch"; patch: Partial<State> }
  | { type: "buy"; token: FeedToken; usd: number; qty: number; entryPriceSol: number; tp: boolean }
  | { type: "sell"; mint: string; proceedsUsd: number; symbol: string }
  | { type: "deposit"; amount: number }
  | { type: "bookPlan" }
  | { type: "cancelPlan" }
  | { type: "seedReferrals"; referrals: Referral[]; rewardTotal: number }
  | { type: "hydrate"; state: State }
  | { type: "reset" };

function log(state: State, row: ActivityRow): ActivityRow[] {
  return [row, ...state.activity];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "reset":
      return initialState;

    case "patch":
      return { ...state, ...action.patch };

    case "deposit": {
      return {
        ...state,
        cash: state.cash + action.amount,
        activity: log(state, {
          title: "Deposit",
          amount: money(action.amount),
          time: "just now",
          dot: "#A78BFA",
        }),
      };
    }

    case "buy": {
      const spend = Math.min(action.usd, state.cash);
      if (spend <= 0 || action.qty <= 0) return state;

      const existing = state.holdings.find((h) => h.mint === action.token.mint);
      const holdings = existing
        ? state.holdings.map((h) =>
            h.mint === action.token.mint
              ? {
                  ...h,
                  usd: h.usd + spend,
                  qty: h.qty + action.qty,
                  // Weighted average entry, so PnL stays honest after a top-up.
                  entryPriceSol:
                    (h.entryPriceSol * h.qty + action.entryPriceSol * action.qty) / (h.qty + action.qty),
                  tp: h.tp || action.tp,
                }
              : h,
          )
        : [
            ...state.holdings,
            {
              mint: action.token.mint,
              symbol: action.token.symbol,
              name: action.token.name,
              imageUri: action.token.imageUri,
              usd: spend,
              qty: action.qty,
              entryPriceSol: action.entryPriceSol,
              tp: action.tp,
            },
          ];

      return {
        ...state,
        holdings,
        cash: state.cash - spend,
        activity: log(state, {
          title: "Bought " + action.token.symbol + (action.tp ? " \u00b7 take-profit 2\u00d7" : ""),
          amount: money(spend),
          time: "just now",
          dot: "#C6F24E",
        }),
      };
    }

    case "sell": {
      const held = state.holdings.find((h) => h.mint === action.mint);
      if (!held) return state;
      return {
        ...state,
        holdings: state.holdings.filter((h) => h.mint !== action.mint),
        cash: state.cash + action.proceedsUsd,
        activity: log(state, {
          title: "Sold " + action.symbol,
          amount: money(action.proceedsUsd),
          time: "just now",
          dot: "#FF6B6B",
        }),
      };
    }

    case "bookPlan": {
      const plan = PLANS.find((p) => p.id === state.plan);
      if (!plan || state.cash < plan.price) return state;
      return {
        ...state,
        cash: state.cash - plan.price,
        activePlan: plan.id,
        activeCoach: state.coach,
        activity: log(state, {
          title: "Coaching \u00b7 " + plan.tag,
          amount: money(plan.price),
          time: "just now",
          dot: "#7DD3FC",
        }),
      };
    }

    case "cancelPlan": {
      const plan = PLANS.find((p) => p.id === state.activePlan);
      if (!plan) return state;
      return { ...state, activePlan: null, cash: state.cash + plan.price };
    }

    case "seedReferrals": {
      // Demo path for the partner program: append sample referrals and credit
      // their funded-signup rewards straight to the balance.
      const existing = new Set(state.referrals.map((r) => r.handle));
      const fresh = action.referrals.filter((r) => !existing.has(r.handle));
      if (fresh.length === 0) return state;
      return {
        ...state,
        referrals: [...state.referrals, ...fresh],
        cash: state.cash + action.rewardTotal,
        activity: log(state, {
          title: "Referral rewards",
          amount: money(action.rewardTotal),
          time: "just now",
          dot: "#A78BFA",
        }),
      };
    }

    default:
      return state;
  }
}

const STORAGE_KEY = "blip:state:v2";

type Ctx = {
  state: State;
  /** False until localStorage has been read, so nothing renders stale on first paint. */
  ready: boolean;
  toast: string | null;
  patch: (patch: Partial<State>) => void;
  showToast: (message: string) => void;
  /** Async: fetches a live quote, then books the paper fill against it. */
  buy: (token: FeedToken, usd: number, tp: boolean) => Promise<void>;
  sell: (holding: Holding, reason?: "tp") => Promise<void>;
  /** Mint currently being traded, for per-row spinners. */
  pendingMint: string | null;
  deposit: (amount: number) => void;
  bookPlan: () => void;
  cancelPlan: () => void;
  seedReferrals: (list: Referral[]) => void;
  reset: () => void;
  /** Live per-token prices from the real feed, refreshed in the background. */
  prices: Record<string, PriceInfo>;
  /** Force a price refresh now. */
  refreshPrices: () => Promise<void>;
};

const BlipContext = createContext<Ctx | null>(null);

export function BlipProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "hydrate", state: { ...initialState, ...JSON.parse(raw) } });
    } catch {
      /* corrupt or unavailable storage: fall back to a fresh session */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota or private mode: state stays in memory only */
    }
  }, [state, ready]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3400);
  }, []);

  const patch = useCallback((p: Partial<State>) => dispatch({ type: "patch", patch: p }), []);

  const [pendingMint, setPendingMint] = useState<string | null>(null);

  // ---- live market prices (client-side marks) ------------------------------
  // The balance is a frontend construct that acts on real market data: the
  // feed's actual prices and market caps mark every position, cash is local,
  // and no backend writes happen anywhere.
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const failedMints = useRef<Set<string>>(new Set());

  const pullPrices = useCallback(async () => {
    try {
      const result = await api.feed("trending", 50);
      const next: Record<string, PriceInfo> = {};
      for (const t of result.tokens) {
        if (t.priceUsd > 0) next[t.mint] = { priceUsd: t.priceUsd, marketCapUsd: t.marketCapUsd };
      }
      if (Object.keys(next).length > 0) setPrices((prev) => ({ ...prev, ...next }));
    } catch {
      /* keep the last snapshot; positions just stay marked at the old price */
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void pullPrices();
    const id = setInterval(() => void pullPrices(), 15_000);
    return () => clearInterval(id);
  }, [ready, pullPrices]);

  // Held tokens can fall out of the trending feed; fetch those directly, once
  // per session per mint so an unpriceable token never spams the API.
  useEffect(() => {
    if (!ready) return;
    const missing = state.holdings.filter(
      (h) => !prices[h.mint] && !failedMints.current.has(h.mint),
    );
    if (missing.length === 0) return;
    let alive = true;
    void Promise.all(
      missing.map(async (h) => {
        try {
          return (await api.token(h.mint)).token;
        } catch {
          failedMints.current.add(h.mint);
          return null;
        }
      }),
    ).then((tokens) => {
      if (!alive) return;
      const next: Record<string, PriceInfo> = {};
      for (const t of tokens) {
        if (t && t.priceUsd > 0) next[t.mint] = { priceUsd: t.priceUsd, marketCapUsd: t.marketCapUsd };
      }
      if (Object.keys(next).length > 0) setPrices((prev) => ({ ...prev, ...next }));
    });
    return () => { alive = false; };
  }, [ready, state.holdings, prices]);

  /**
   * Buys are capped, sized against real cash, and priced by the backend against
   * the live bonding curve, so the fill reflects real fees and price impact.
   * Only the settlement is simulated — signing a real transaction needs a wallet
   * adapter.
   */
  const buy = useCallback(
    async (token: FeedToken, usd: number, tp: boolean) => {
      if (token.graduated) {
        showToast(`${token.symbol} graduated — route it through a DEX instead`);
        return;
      }
      // The per-trade cap is enforced here, on every path that buys (discover
      // row, token page, terminal) — not per caller.
      const want = Math.min(usd, state.cap);
      if (want < usd) showToast(`Per-trade cap is ${money(state.cap, 0)} — sized it down`);
      if (want <= 0) {
        showToast("Add funds to place a trade");
        return;
      }
      if (want > state.cash) {
        showToast(
          state.cash > 0
            ? `Not enough cash — you have ${money(state.cash)}, this needs ${money(want, 0)}. Tap Balance to top up.`
            : `You're out of cash. Tap Balance to top up.`,
        );
        return;
      }
      const spend = want;

      setPendingMint(token.mint);
      try {
        const solUsd = token.priceUsd > 0 ? token.priceUsd / token.priceSol : 0;
        if (!solUsd) throw new Error("No SOL price available right now");

        const solIn = spend / solUsd;
        const result = await api.quote(token.mint, "buy", solIn);
        if (!result.success || !result.data) throw new Error(result.error ?? "Quote failed");

        const quote: Quote = result.data;
        if (quote.highImpact) {
          showToast(`Skipped — ${(quote.priceImpact * 100).toFixed(1)}% price impact on that size`);
          return;
        }

        dispatch({
          type: "buy",
          token,
          usd: spend,
          qty: quote.amountOut,
          entryPriceSol: quote.executionPrice,
          tp,
        });
        showToast(buyToast(token.symbol, money(spend)));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Trade failed");
      } finally {
        setPendingMint(null);
      }
    },
    [state.cap, state.cash, showToast],
  );

  /** Exits are quoted the same way, so the proceeds include exit impact. */
  const sell = useCallback(
    async (holding: Holding, reason?: "tp") => {
      setPendingMint(holding.mint);
      try {
        const result = await api.quote(holding.mint, "sell", holding.qty);
        if (!result.success || !result.data) throw new Error(result.error ?? "Quote failed");

        const quote = result.data;
        // Without a SOL price the proceeds would compute to $0 and the position
        // would be closed for nothing. Refuse rather than book a fictional exit.
        if (!quote.solUsd) throw new Error("No SOL price available right now — try again shortly");

        const proceedsUsd = quote.amountOut * quote.solUsd;

        dispatch({ type: "sell", mint: holding.mint, proceedsUsd, symbol: holding.symbol });
        showToast(
          reason === "tp"
            ? tpToast(holding.symbol)
            : sellToast(holding.symbol, proceedsUsd - holding.usd),
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Exit failed");
      } finally {
        setPendingMint(null);
      }
    },
    [showToast],
  );

  // ---- take-profit watcher -------------------------------------------------
  // The 2× flag armed at buy time actually fires: every 15s, positions armed
  // for TP are marked at the live market price, and anything at ≥2× cost basis
  // is exited through the same quoted sell path as a manual exit.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      for (const h of state.holdings) {
        if (!h.tp) continue;
        const value = liveValue(h, prices);
        if (value !== null && value >= h.usd * 2) void sell(h, "tp");
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [ready, state.holdings, prices, sell]);

  const deposit = useCallback(
    (amount: number) => {
      dispatch({ type: "deposit", amount });
      showToast("Added " + money(amount) + " to your balance");
    },
    [showToast]
  );

  const bookPlan = useCallback(() => {
    const plan = PLANS.find((p) => p.id === state.plan);
    if (!plan) return;
    if (state.cash < plan.price) {
      showToast("Add " + money(plan.price - state.cash) + " to book this plan");
      return;
    }
    dispatch({ type: "bookPlan" });
    const coach = COACHES.find((x) => x.id === state.coach);
    showToast("Booked with " + (coach ? coach.name : "your coach"));
  }, [state.plan, state.cash, state.coach, showToast]);

  const cancelPlan = useCallback(() => {
    dispatch({ type: "cancelPlan" });
    showToast("Plan cancelled and refunded");
  }, [showToast]);

  const seedReferrals = useCallback(
    (list: Referral[]) => {
      const rewardTotal = list
        .filter((r) => r.funded)
        .reduce((a, r) => a + (r.rewardUsd || REFERRAL_REWARD_USD), 0);
      dispatch({ type: "seedReferrals", referrals: list, rewardTotal });
      showToast(
        rewardTotal > 0
          ? `Demo referrals added — ${money(rewardTotal)} in rewards credited`
          : "Demo referrals added",
      );
    },
    [showToast],
  );

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state, ready, toast, patch, showToast, buy, sell, deposit,
      bookPlan, cancelPlan, seedReferrals, reset, pendingMint, prices, refreshPrices: pullPrices,
    }),
    [state, ready, toast, patch, showToast, buy, sell, deposit, bookPlan, cancelPlan, seedReferrals, reset, pendingMint, prices, pullPrices]
  );

  return <BlipContext.Provider value={value}>{children}</BlipContext.Provider>;
}

export function useBlip(): Ctx {
  const ctx = useContext(BlipContext);
  if (!ctx) throw new Error("useBlip must be used inside <BlipProvider>");
  return ctx;
}
