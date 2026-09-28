export interface AppConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  /** Allow any localhost port during development. */
  allowLocalhostOrigins: boolean;
  rpcUrl: string;
  pumpApiBases: string[];
  cacheTtlMs: number;
}

/**
 * frontend-api.pump.fun has been returning Cloudflare 1016 for some time.
 * v3 is the live host, so it leads the list — the old primary is kept last
 * as a cheap fallback rather than an 8s timeout on every single request.
 */
export const DEFAULT_PUMP_API_BASES = [
  'https://frontend-api-v3.pump.fun',
  'https://frontend-api-v2.pump.fun',
  'https://frontend-api.pump.fun',
];

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT) || 8000;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  if (!process.env.SOLANA_RPC_URL) {
    // The public endpoint is rate-limited hard; safety scoring will be flaky on it.
    console.warn('[config] SOLANA_RPC_URL not set — falling back to the public mainnet endpoint.');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    port,
    // 0.0.0.0 so the API is reachable from another container; put it behind the
    // web app's proxy rather than exposing it publicly.
    host: process.env.HOST || '0.0.0.0',
    corsOrigins: (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    // Convenience in dev only — never widen the allow-list in production.
    allowLocalhostOrigins: !isProduction,
    rpcUrl,
    pumpApiBases: process.env.PUMP_API_BASES
      ? process.env.PUMP_API_BASES.split(',').map((s) => s.trim())
      : DEFAULT_PUMP_API_BASES,
    cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 30_000,
  };
}
