import { tenantEnv } from '../common/tenant';

/**
 * Custody configuration, resolved per tenant.
 *
 * blip holds each user's Solana wallet: one Privy server wallet per user per
 * tenant, controlled by this backend. Custody is OFF until PRIVY_APP_ID and
 * PRIVY_APP_SECRET are set, and real trades stay off until
 * CUSTODY_LIVE_TRADING=true on top of that — so a deploy with keys but no
 * explicit switch can show balances and accept withdrawals without ever buying.
 *
 * Every key can be overridden for one tenant with a suffix, e.g.
 * PRIVY_APP_ID_FLICK or CUSTODY_MAX_TRADE_USD_KITE.
 */
export interface CustodyConfig {
  tenant: string;
  appId: string | null;
  appSecret: string | null;
  /**
   * Base64 PKCS8 P-256 private key (no PEM headers). When set, new wallets are
   * owned by its public key and every signature needs it, so a leaked app
   * secret alone cannot move funds. Losing it locks those wallets — back it up.
   */
  authorizationKey: string | null;
  /** Explicit switch for signing and broadcasting trades. */
  liveTrading: boolean;
  /** Hard per-trade ceiling in USD, applied on top of the user's own cap. */
  maxTradeUsd: number;
  /** SOL a buy must leave behind for fees and token-account rent. */
  feeReserveSol: number;
  /** Priority fee passed to PumpPortal, in SOL. */
  priorityFeeSol: number;
  /** Programs a trade transaction may invoke beyond the built-in allowlist. */
  extraPrograms: string[];
}

export function loadCustodyConfig(tenant: string, env: NodeJS.ProcessEnv = process.env): CustodyConfig {
  const get = (key: string) => tenantEnv(env, key, tenant)?.trim();
  const num = (key: string, fallback: number) => {
    const value = get(key);
    const n = Number(value);
    return value && Number.isFinite(n) ? n : fallback;
  };

  return {
    tenant,
    appId: get('PRIVY_APP_ID') || null,
    appSecret: get('PRIVY_APP_SECRET') || null,
    authorizationKey: get('PRIVY_AUTHORIZATION_KEY')?.replace(/^wallet-auth:/, '') || null,
    liveTrading: get('CUSTODY_LIVE_TRADING') === 'true',
    maxTradeUsd: num('CUSTODY_MAX_TRADE_USD', 250),
    feeReserveSol: num('CUSTODY_FEE_RESERVE_SOL', 0.01),
    priorityFeeSol: num('CUSTODY_PRIORITY_FEE_SOL', 0.00005),
    extraPrograms: (get('CUSTODY_EXTRA_PROGRAMS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Privy IDs look like `did:privy:cm…`; external_id allows [a-zA-Z0-9_-], max 64. */
export function externalIdFor(tenant: string, userId: string): string {
  return `${tenant}-${userId.replace(/^did:privy:/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64);
}
