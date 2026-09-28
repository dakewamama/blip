import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  TokenBalance,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { FundingConfig } from './funding.config';
import { DepositLedger, CreditRecord } from './deposit-ledger';

/**
 * Watches the chain for USDC arriving at each user's wallet and credits the
 * balance ONLY after the deposit reaches the configured commitment on-chain —
 * never on any client's say-so. Ported from dakewamama/onboarding
 * (payments/src/funding/usdcWatcher.ts).
 *
 * The set of watched owners is persisted, so a restart re-arms every watch and
 * the poll re-scans recent signatures: a deposit that landed while we were down
 * is picked up on the next poll and credited (idempotently) then.
 */
export class UsdcWatcher {
  private readonly logger = new Logger(UsdcWatcher.name);
  private readonly mint: PublicKey;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private readonly watchDir: string;

  constructor(
    private readonly cfg: FundingConfig,
    private readonly ledger: DepositLedger,
    private readonly connection: Connection,
    private readonly onCredit: (r: CreditRecord) => void | Promise<void> = () => {},
  ) {
    this.mint = new PublicKey(cfg.usdcMint);
    this.watchDir = path.join(cfg.storeDir, 'watch');
    fs.mkdirSync(this.watchDir, { recursive: true });
  }

  /** The USDC associated-token account a deposit to `owner` lands in. */
  depositAta(owner: string): PublicKey {
    return getAssociatedTokenAddressSync(this.mint, new PublicKey(owner));
  }

  /** Persist an owner into the watchlist so it survives restarts. Idempotent. */
  watch(owner: string): void {
    new PublicKey(owner); // validate it is a real pubkey before persisting
    const file = path.join(this.watchDir, `${safe(owner)}.json`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify({ owner, at: new Date().toISOString() }, null, 2));
    }
  }

  private watchedOwners(): string[] {
    return fs
      .readdirSync(this.watchDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.watchDir, f), 'utf8')).owner as string);
  }

  /** Whether an RPC-reported confirmationStatus satisfies our required commitment. */
  private meetsCommitment(status: string | null | undefined): boolean {
    if (this.cfg.commitment === 'finalized') return status === 'finalized';
    return status === 'confirmed' || status === 'finalized';
  }

  /**
   * Net USDC base units credited to `owner` in this transaction, from the
   * pre/post token-balance snapshots the RPC returns. Using the balance delta
   * (not instruction decoding) captures plain transfers, transferChecked, and CPI
   * transfers alike.
   */
  private incomingBaseUnits(tx: ParsedTransactionWithMeta, owner: string): bigint {
    const mint = this.cfg.usdcMint;
    const match = (b: TokenBalance) => b.mint === mint && b.owner === owner;
    const pre = tx.meta?.preTokenBalances?.find(match);
    const post = tx.meta?.postTokenBalances?.find(match);
    const before = pre ? BigInt(pre.uiTokenAmount.amount) : BigInt(0);
    const after = post ? BigInt(post.uiTokenAmount.amount) : BigInt(0);
    const delta = after - before;
    return delta > BigInt(0) ? delta : BigInt(0);
  }

  /** One scan of one owner's deposit account. Credits any fresh confirmed deposits. */
  async scanOwner(owner: string): Promise<void> {
    const ata = this.depositAta(owner);
    const sigs = await this.connection.getSignaturesForAddress(ata, { limit: this.cfg.pageSize });

    for (const info of sigs) {
      if (info.err) continue; // failed tx moved no funds
      if (!this.meetsCommitment(info.confirmationStatus)) continue; // not confirmed enough
      if (this.ledger.hasCredited(owner, info.signature)) continue; // already credited

      const tx = await this.connection.getParsedTransaction(info.signature, {
        commitment: this.cfg.commitment,
        maxSupportedTransactionVersion: 0,
      });
      if (!tx || tx.meta?.err) continue;

      const baseUnits = this.incomingBaseUnits(tx, owner);
      if (baseUnits <= BigInt(0)) continue; // not an incoming USDC transfer

      const fresh = this.ledger.credit({
        signature: info.signature,
        owner,
        baseUnits: baseUnits.toString(),
        commitment: this.cfg.commitment,
      });
      if (fresh) {
        await this.onCredit({
          signature: info.signature,
          owner,
          baseUnits: baseUnits.toString(),
          commitment: this.cfg.commitment,
          at: new Date().toISOString(),
        });
      }
    }
  }

  /** One full poll across every watched owner. Single-flight. */
  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const owner of this.watchedOwners()) {
        try {
          await this.scanOwner(owner);
        } catch (err) {
          this.logger.warn(`scan failed for ${owner}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  start(): void {
    if (this.timer) return;
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.cfg.pollIntervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}
