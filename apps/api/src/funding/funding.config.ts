import * as path from 'path';

/**
 * Crypto-funding (USDC on Solana) configuration.
 * Ported from dakewamama/onboarding (payments/src/funding/config.ts) and adapted
 * to blip: the RPC connection is shared with SolanaService, and CORS is handled
 * globally in main.ts, so those concerns are not repeated here.
 */
export interface FundingConfig {
  /** USDC SPL mint address. Defaults to mainnet USDC; override on devnet/staging. */
  usdcMint: string;
  /** Commitment a deposit must reach before it is credited. */
  commitment: 'confirmed' | 'finalized';
  /** How often the watcher polls the chain, milliseconds. */
  pollIntervalMs: number;
  /** How many signatures to pull per address per poll. */
  pageSize: number;
  /** Durable store directory (gitignored). Deposits survive restarts here. */
  storeDir: string;
}

// Real mainnet USDC (6 decimals).
export const MAINNET_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export function loadFundingConfig(env: NodeJS.ProcessEnv = process.env): FundingConfig {
  // A demo deposit is credited responsively at "confirmed"; a real money flow
  // should raise this to "finalized" (the onboarding reference default).
  const commitment = (env.SOLANA_COMMITMENT ?? 'confirmed').toLowerCase();
  if (commitment !== 'confirmed' && commitment !== 'finalized') {
    throw new Error(`SOLANA_COMMITMENT must be "confirmed" or "finalized", got "${commitment}"`);
  }

  return {
    usdcMint: env.SOLANA_USDC_MINT ?? MAINNET_USDC,
    commitment,
    pollIntervalMs: env.FUNDING_POLL_INTERVAL_MS ? Number(env.FUNDING_POLL_INTERVAL_MS) : 20_000,
    pageSize: env.FUNDING_PAGE_SIZE ? Number(env.FUNDING_PAGE_SIZE) : 25,
    storeDir: env.FUNDING_STORE_DIR ?? path.resolve(process.cwd(), '.funding-store'),
  };
}
