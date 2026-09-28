/**
 * The pump.fun v3 payload does not match the field names the original code assumed.
 * Two consequences that were silently wrong:
 *   - market cap arrives as `market_cap_usd`, not `usd_market_cap`, so every
 *     sum/sort over `usd_market_cap` evaluated to 0.
 *   - `created_timestamp` is in MILLISECONDS, so comparing it against a
 *     seconds-based cutoff classified every token as "new".
 * Everything upstream-shaped goes through here before it is used.
 */
export interface NormalizedToken {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  imageUri?: string;
  creator: string;
  bondingCurve?: string;
  tokenProgram?: string;
  /** Always milliseconds since epoch. */
  createdAt: number;
  complete: boolean;
  isLive: boolean;
  nsfw: boolean;
  virtualSolReserves: number;
  virtualTokenReserves: number;
  realSolReserves: number;
  totalSupply: number;
  baseDecimals: number;
  /** SOL per token, derived from the curve. */
  priceSol: number;
  marketCapUsd: number;
  replyCount: number;
  raw: Record<string, unknown>;
}

const LAMPORTS = 1_000_000_000;

function toMillis(ts: unknown): number {
  const n = Number(ts) || 0;
  if (n === 0) return 0;
  // Anything below ~year 2286 in ms is a seconds value.
  return n < 1e12 ? n * 1000 : n;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeToken(raw: Record<string, any>): NormalizedToken {
  const virtualSolReserves = num(raw.virtual_sol_reserves ?? raw.virtual_quote_reserves);
  const virtualTokenReserves = num(raw.virtual_token_reserves);
  const baseDecimals = num(raw.base_decimals, 6);

  // Curve price in SOL per whole token, accounting for differing decimals.
  const priceSol =
    virtualTokenReserves > 0
      ? (virtualSolReserves / LAMPORTS) / (virtualTokenReserves / 10 ** baseDecimals)
      : 0;

  return {
    mint: String(raw.mint ?? ''),
    name: String(raw.name ?? 'Unknown'),
    symbol: String(raw.symbol ?? '???'),
    description: raw.description ?? undefined,
    imageUri: raw.image_uri ?? undefined,
    creator: String(raw.creator ?? ''),
    bondingCurve: raw.bonding_curve ?? undefined,
    tokenProgram: raw.token_program ?? undefined,
    createdAt: toMillis(raw.created_timestamp),
    complete: Boolean(raw.complete),
    isLive: Boolean(raw.is_currently_live),
    nsfw: Boolean(raw.nsfw),
    virtualSolReserves,
    virtualTokenReserves,
    realSolReserves: num(raw.real_sol_reserves ?? raw.real_quote_reserves),
    totalSupply: num(raw.total_supply),
    baseDecimals,
    priceSol,
    // Accept either spelling; prefer the one v3 actually sends.
    marketCapUsd: num(raw.market_cap_usd ?? raw.usd_market_cap),
    replyCount: num(raw.reply_count),
    raw,
  };
}

export function ageLabel(createdAt: number): string {
  if (!createdAt) return 'unknown';
  const mins = Math.max(0, (Date.now() - createdAt) / 60_000);
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}
