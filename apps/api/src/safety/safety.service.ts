import { Injectable, Logger } from '@nestjs/common';
import { SolanaService } from '../common/solana.service';
import { TtlCache } from '../common/cache';
import { curveProgress } from '../common/curve';
import { NormalizedToken, ageLabel } from '../common/normalize';

export type CheckLevel = 'ok' | 'warn' | 'bad';

export interface SafetyCheck {
  id: string;
  level: CheckLevel;
  /** Plain English, written for someone who has never read a contract. */
  text: string;
  /** How many points this check moved the score. */
  weight: number;
}

export interface SafetyReport {
  mint: string;
  score: number;
  verdict: 'Clear' | 'Watch' | 'Risky';
  checks: SafetyCheck[];
  /** False when RPC lookups failed and the score leans on curve data alone. */
  complete: boolean;
  computedAt: number;
}

/**
 * Turns on-chain facts into one number and three sentences.
 *
 * Deliberately starts at 100 and subtracts for evidence of risk, so a token
 * we know nothing about does not score well by default — missing data is
 * penalised via `complete: false` and a warn check rather than ignored.
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);
  // Authorities and holder distribution change slowly; 2 minutes is plenty.
  private readonly cache = new TtlCache<SafetyReport>(120_000, 1000);

  /** Hard ceiling on how long one token may spend in RPC before we give up. */
  private static readonly SCORE_BUDGET_MS = 5000;

  constructor(private readonly solana: SolanaService) {}

  /** Resolves to `fallback` rather than hanging when the RPC is rate-limited. */
  private static async withBudget<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    });
    try {
      return await Promise.race([work, guard]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async getReport(token: NormalizedToken): Promise<SafetyReport> {
    return this.cache.wrap(token.mint, () => this.compute(token));
  }

  /** Scores many tokens without issuing an RPC storm. */
  async getReports(tokens: NormalizedToken[], concurrency = 5): Promise<Map<string, SafetyReport>> {
    const out = new Map<string, SafetyReport>();
    const queue = [...tokens];

    const worker = async () => {
      while (queue.length) {
        const token = queue.shift();
        if (!token) break;
        try {
          out.set(token.mint, await this.getReport(token));
        } catch (error: any) {
          this.logger.warn(`Safety scoring failed for ${token.mint}: ${error.message}`);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, tokens.length) }, worker));
    return out;
  }

  private async compute(token: NormalizedToken): Promise<SafetyReport> {
    const checks: SafetyCheck[] = [];
    let score = 100;
    let complete = true;

    const penalise = (id: string, level: CheckLevel, text: string, weight: number) => {
      checks.push({ id, level, text, weight: -weight });
      score -= weight;
    };
    const pass = (id: string, text: string) => {
      checks.push({ id, level: 'ok', text, weight: 0 });
    };

    // ---- 1. Mint and freeze authority -------------------------------------
    const authorities = await SafetyService.withBudget(
      this.solana.getMintAuthorities(token.mint),
      null,
      SafetyService.SCORE_BUDGET_MS,
    );
    if (!authorities) {
      complete = false;
      penalise('authority-unknown', 'warn', 'Could not read the mint account — treat with caution', 15);
    } else {
      if (authorities.mintAuthority) {
        penalise('mint-authority', 'bad', 'Mint authority is still live — supply can be inflated', 35);
      } else {
        pass('mint-authority', 'Mint authority revoked');
      }

      if (authorities.freezeAuthority) {
        penalise('freeze-authority', 'bad', 'Freeze authority is live — your tokens can be frozen', 30);
      } else {
        pass('freeze-authority', 'Freeze authority revoked');
      }
    }

    // ---- 2. Holder concentration ------------------------------------------
    const holders = await SafetyService.withBudget(
      this.solana.getLargestHolders(token.mint),
      [] as { address: string; uiAmount: number }[],
      SafetyService.SCORE_BUDGET_MS,
    );
    if (holders.length === 0) {
      complete = false;
      penalise('holders-unknown', 'warn', 'Holder distribution unavailable', 8);
    } else {
      const supply = holders.reduce((a, h) => a + h.uiAmount, 0);
      if (supply > 0) {
        // On an un-graduated token the curve itself is the top account; skip it
        // so the reading reflects actual wallets rather than the pool.
        const wallets = token.complete ? holders : holders.slice(1);
        const topShare = wallets.length ? wallets[0].uiAmount / supply : 0;
        const top10Share = wallets.slice(0, 10).reduce((a, h) => a + h.uiAmount, 0) / supply;

        if (topShare > 0.25) {
          penalise('top-holder', 'bad', `Top wallet holds ${(topShare * 100).toFixed(1)}%`, 30);
        } else if (topShare > 0.1) {
          penalise('top-holder', 'warn', `Top wallet holds ${(topShare * 100).toFixed(1)}%`, 14);
        } else {
          pass('top-holder', `Top wallet holds ${(topShare * 100).toFixed(1)}%`);
        }

        if (top10Share > 0.6) {
          penalise('top-ten', 'warn', `Top 10 wallets hold ${(top10Share * 100).toFixed(0)}%`, 12);
        }
      }
    }

    // ---- 3. Liquidity depth ------------------------------------------------
    const realSol = token.realSolReserves / 1e9;
    if (realSol < 1) {
      penalise('liquidity', 'bad', `Only ${realSol.toFixed(2)} SOL of real liquidity — you may not get out`, 25);
    } else if (realSol < 10) {
      penalise('liquidity', 'warn', `${realSol.toFixed(1)} SOL of liquidity — thin, expect slippage`, 12);
    } else {
      pass('liquidity', `${realSol.toFixed(0)} SOL of real liquidity`);
    }

    // ---- 4. Age ------------------------------------------------------------
    const ageMinutes = token.createdAt ? (Date.now() - token.createdAt) / 60_000 : 0;
    if (token.createdAt === 0) {
      complete = false;
    } else if (ageMinutes < 15) {
      penalise('age', 'warn', `Contract is ${ageLabel(token.createdAt)} old — no track record yet`, 12);
    } else if (ageMinutes < 60 * 24) {
      penalise('age', 'warn', `Contract is ${ageLabel(token.createdAt)} old`, 5);
    } else {
      pass('age', `Contract is ${ageLabel(token.createdAt)} old`);
    }

    // ---- 5. Graduation status ---------------------------------------------
    if (token.complete) {
      pass('graduated', 'Graduated to a full AMM pool');
    } else {
      const progress = curveProgress(token.realSolReserves);
      if (progress < 0.05) {
        penalise('curve', 'warn', `Bonding curve is ${(progress * 100).toFixed(0)}% filled`, 6);
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    // Surface the worst findings first — that's what a trader needs to read.
    const rank: Record<CheckLevel, number> = { bad: 0, warn: 1, ok: 2 };
    checks.sort((a, b) => rank[a.level] - rank[b.level] || a.weight - b.weight);

    return {
      mint: token.mint,
      score,
      verdict: score >= 75 ? 'Clear' : score >= 55 ? 'Watch' : 'Risky',
      checks,
      complete,
      computedAt: Date.now(),
    };
  }
}
