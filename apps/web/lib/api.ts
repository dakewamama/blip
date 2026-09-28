/**
 * Client for the trigger2nest backend.
 *
 * Every price, score and quote in this app comes from here. Nothing is
 * generated locally — if the backend is down the UI says so rather than
 * rendering a plausible-looking fiction.
 */

/**
 * Two different base URLs on purpose.
 *
 * In the browser we call the same origin (`/api`) and let the Next rewrite in
 * next.config.mjs proxy through to Nest. Nothing is cross-origin, so CORS never
 * enters into it.
 *
 * On the server, Next talks to Nest directly — proxying a server-side request
 * through your own public URL is a pointless extra hop, and in a container the
 * public hostname may not even resolve from inside.
 */
const INTERNAL_API =
  process.env.API_INTERNAL_URL ?? `${process.env.API_ORIGIN ?? "http://localhost:8000"}/api`;

export const API_BASE = typeof window === "undefined" ? INTERNAL_API : "/api";

export type FeedFilter = "trending" | "new" | "gainers" | "safest" | "featured";

export interface FeedToken {
  mint: string;
  name: string;
  symbol: string;
  imageUri?: string;
  age: string;
  createdAt: number;
  priceSol: number;
  priceUsd: number;
  marketCapUsd: number;
  liquiditySol: number;
  liquidityUsd: number;
  curveProgress: number;
  graduated: boolean;
  score: number | null;
  verdict: string | null;
  safetyComplete: boolean;
}

export interface FeedResult {
  tokens: FeedToken[];
  solUsd: number;
  solPriceStale: boolean;
  hiddenByFloor: number;
  filter: FeedFilter;
}

export interface SafetyCheck {
  id: string;
  level: "ok" | "warn" | "bad";
  text: string;
  weight: number;
}

export interface SafetyReport {
  mint: string;
  score: number;
  verdict: "Clear" | "Watch" | "Risky";
  checks: SafetyCheck[];
  /** False when an RPC lookup timed out — the score is partial. Say so in the UI. */
  complete: boolean;
  computedAt: number;
}

export interface HistoryPoint {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number;
}

export interface HistoryResult {
  points: HistoryPoint[];
  source: "geckoterminal" | "unavailable";
  poolId: string | null;
}

export interface Quote {
  mint: string;
  symbol: string;
  action: "buy" | "sell";
  amountIn: number;
  amountOut: number;
  minAmountOut: number;
  spotPrice: number;
  executionPrice: number;
  priceImpact: number;
  feeSol: number;
  slippageBps: number;
  solUsd: number;
  valueUsd: number;
  highImpact: boolean;
  computedAt: number;
}

export interface PortfolioPosition {
  mint: string;
  name: string;
  symbol: string;
  imageUri?: string;
  amount: number;
  priceSol: number;
  exitValueSol: number;
  exitValueUsd: number;
  markValueUsd: number;
  priceImpactOnExit: number;
  graduated: boolean;
}

export interface Portfolio {
  address: string;
  solBalance: number;
  solUsd: number;
  solPriceStale: boolean;
  cashUsd: number;
  positionsUsd: number;
  totalUsd: number;
  positions: PortfolioPosition[];
  unpriced: { mint: string; amount: number }[];
}

export interface DepositAddress {
  owner: string;
  usdcAta: string;
  mint: string;
  /** Solana Pay URI, render as a QR. */
  qr: string;
  requiredCommitment: string;
}

export interface FundingBalance {
  owner: string;
  usdc: string;
  baseUnits: string;
}

export interface FundingDeposit {
  signature: string;
  usdc: string;
  at: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit & { revalidate?: number } = {}): Promise<T> {
  const { revalidate, ...rest } = init;

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...rest.headers },
    // Server components cache by default; these are live markets.
    ...(revalidate !== undefined ? { next: { revalidate } } : { cache: "no-store" as const }),
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = Array.isArray(body.message) ? body.message.join(", ") : body.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  feed: (filter: FeedFilter = "trending", limit = 25, includeUnsafe = false) =>
    request<FeedResult>(
      `/feed?filter=${filter}&limit=${limit}&includeUnsafe=${includeUnsafe}`,
      { revalidate: 15 },
    ),

  search: (q: string, limit = 20) =>
    request<FeedResult>(`/feed/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  token: (mint: string) =>
    request<{ token: FeedToken; safety: SafetyReport | null }>(`/feed/${mint}`, { revalidate: 10 }),

  history: (mint: string, timeframe: "minute" | "hour" | "day" = "minute", limit = 60) =>
    request<HistoryResult>(`/feed/${mint}/history?timeframe=${timeframe}&limit=${limit}`, {
      revalidate: 30,
    }),

  quote: (mint: string, action: "buy" | "sell", amount: number, slippageBps = 100) =>
    request<{ success: boolean; data?: Quote; error?: string }>(
      `/pump/quote/${mint}?action=${action}&amount=${amount}&slippageBps=${slippageBps}`,
    ),

  portfolio: (address: string) => request<Portfolio>(`/portfolio/${address}`),

  /** Broadcasts a wallet-signed transaction. Needs a wallet adapter to be useful. */
  submit: (signedTransaction: string, action?: "buy" | "sell", mint?: string) =>
    request<{ success: boolean; data?: { signature: string; explorer: string }; error?: string }>(
      `/pump/submit`,
      { method: "POST", body: JSON.stringify({ signedTransaction, action, mint }) },
    ),

  ready: () =>
    request<{ status: string; dependencies: Record<string, string> }>(`/ready`),

  /** USDC-on-Solana funding (ported from dakewamama/onboarding). */
  fundingAddress: (owner: string) =>
    request<DepositAddress>(`/funding/address`, {
      method: "POST",
      body: JSON.stringify({ owner }),
    }),

  fundingBalance: (owner: string) =>
    request<FundingBalance>(`/funding/balance?owner=${encodeURIComponent(owner)}`),

  fundingDeposits: (owner: string) =>
    request<{ owner: string; deposits: FundingDeposit[] }>(
      `/funding/deposits?owner=${encodeURIComponent(owner)}`,
    ),
};
