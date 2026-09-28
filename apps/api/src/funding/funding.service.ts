import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SolanaService } from '../common/solana.service';
import { FundingConfig, loadFundingConfig } from './funding.config';
import { DepositLedger, CreditRecord } from './deposit-ledger';
import { UsdcWatcher } from './usdc-watcher';
import { TransferBuilder, BuiltTransfer } from './transfer-builder';
import { fromBaseUnits } from './money';

export interface DepositAddress {
  /** The user's own wallet address — where they send USDC. blip never holds the key. */
  owner: string;
  /** The USDC associated-token account the deposit actually lands in. */
  usdcAta: string;
  /** USDC mint being watched. */
  mint: string;
  /** Solana Pay URI, suitable for rendering as a QR code on the client. */
  qr: string;
  /** Commitment a deposit must reach before it is credited. */
  requiredCommitment: string;
}

/**
 * Facade over the crypto-funding flow, ported from dakewamama/onboarding
 * (payments/src/funding/service.ts): hand a user their deposit address, arm the
 * on-chain watch, and report the durably-credited balance. Credit itself only
 * ever happens inside the watcher, gated on on-chain confirmation.
 */
@Injectable()
export class FundingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FundingService.name);
  readonly config: FundingConfig;
  private readonly ledger: DepositLedger;
  private readonly watcher: UsdcWatcher;
  private readonly builder: TransferBuilder;

  constructor(private readonly solana: SolanaService) {
    this.config = loadFundingConfig();
    this.ledger = new DepositLedger(this.config.storeDir);
    // Reuse the shared connection so funding inherits the same abort-timeout and
    // disableRetryOnRateLimit behaviour the rest of the app relies on.
    this.watcher = new UsdcWatcher(this.config, this.ledger, this.solana.connection, (r) =>
      this.logCredit(r),
    );
    this.builder = new TransferBuilder(this.config, this.solana.connection);
  }

  onModuleInit(): void {
    this.watcher.start();
    this.logger.log(
      `USDC funding armed (mint=${this.config.usdcMint}, commitment=${this.config.commitment})`,
    );
  }

  onModuleDestroy(): void {
    this.watcher.stop();
  }

  private assertAddress(address: string, label: string): void {
    if (!this.solana.isValidAddress(address)) {
      throw new BadRequestException(`${label} "${address}" is not a valid Solana address`);
    }
  }

  /**
   * Issue (idempotently) the deposit address for a user's wallet and arm the
   * watch. The address IS the user's own wallet — blip never holds their key.
   */
  issueDepositAddress(owner: string): DepositAddress {
    this.assertAddress(owner, 'owner');
    const ata = this.watcher.depositAta(owner);
    this.watcher.watch(owner);
    return {
      owner,
      usdcAta: ata.toBase58(),
      mint: this.config.usdcMint,
      // Solana Pay: send this token to this address. Amount is left open so the
      // user funds any amount from any wallet or exchange.
      qr: `solana:${owner}?spl-token=${this.config.usdcMint}`,
      requiredCommitment: this.config.commitment,
    };
  }

  /**
   * Build an UNSIGNED USDC transfer from the user's connected wallet to their
   * funding wallet, for them to approve in their own wallet. Arms the watch on the
   * destination so the deposit is credited once it confirms. Never signs.
   */
  async buildTransfer(fromWallet: string, owner: string, amountUsdc: string): Promise<BuiltTransfer> {
    this.assertAddress(fromWallet, 'fromWallet');
    this.assertAddress(owner, 'owner');
    this.watcher.watch(owner);
    return this.builder.build(fromWallet, owner, amountUsdc);
  }

  /** Durably-credited balance for a user, as a canonical decimal USDC string. */
  balance(owner: string): { owner: string; usdc: string; baseUnits: string } {
    this.assertAddress(owner, 'owner');
    const base = this.ledger.balanceBaseUnits(owner);
    return { owner, usdc: fromBaseUnits(base), baseUnits: base.toString() };
  }

  /** Credited deposits for a user, decimal amounts, newest first. */
  deposits(owner: string): Array<{ signature: string; usdc: string; at: string }> {
    this.assertAddress(owner, 'owner');
    return this.ledger.deposits(owner).map((d) => ({
      signature: d.signature,
      usdc: fromBaseUnits(BigInt(d.baseUnits)),
      at: d.at,
    }));
  }

  private logCredit(r: CreditRecord): void {
    this.logger.log(
      `credited ${fromBaseUnits(BigInt(r.baseUnits))} USDC to ${r.owner} (sig=${r.signature}, ${r.commitment})`,
    );
  }
}
