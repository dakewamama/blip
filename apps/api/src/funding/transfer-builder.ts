import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { FundingConfig } from './funding.config';
import { toBaseUnits, USDC_DECIMALS } from './money';

export interface BuiltTransfer {
  /** Base64 of the UNSIGNED transaction. The client's wallet signs and sends it. */
  transactionBase64: string;
  /** Destination = the funded wallet's USDC account (created idempotently if absent). */
  destinationAta: string;
  /** Amount, echoed as integer base units and canonical decimal. */
  baseUnits: string;
  amountUsdc: string;
  mint: string;
}

/**
 * Builds a USDC transfer FROM the user's connected wallet TO their funding wallet
 * and returns it unsigned. Ported from dakewamama/onboarding
 * (payments/src/funding/transferBuilder.ts). The user approves it in their own
 * wallet; blip never holds their key and never signs for them. Crediting still
 * happens only via the on-chain watcher once this lands and confirms — the echoed
 * amount here is NOT a credit signal.
 */
export class TransferBuilder {
  private readonly mint: PublicKey;

  constructor(
    private readonly cfg: FundingConfig,
    private readonly connection: Connection,
  ) {
    this.mint = new PublicKey(cfg.usdcMint);
  }

  async build(fromWallet: string, owner: string, amountUsdc: string): Promise<BuiltTransfer> {
    const from = new PublicKey(fromWallet);
    const to = new PublicKey(owner);
    const baseUnits = toBaseUnits(amountUsdc); // rejects floats / >6 dp at the boundary
    if (baseUnits <= BigInt(0)) {
      throw new Error('amount must be greater than zero');
    }

    const fromAta = getAssociatedTokenAddressSync(this.mint, from);
    const toAta = getAssociatedTokenAddressSync(this.mint, to);

    const tx = new Transaction();
    // Ensure the funding wallet's USDC account exists; idempotent, no-op if present.
    tx.add(createAssociatedTokenAccountIdempotentInstruction(from, toAta, to, this.mint));
    // transferChecked pins mint + decimals, so a wrong-decimals/mint tx can't sign.
    tx.add(
      createTransferCheckedInstruction(fromAta, this.mint, toAta, from, baseUnits, USDC_DECIMALS),
    );

    tx.feePayer = from;
    const { blockhash } = await this.connection.getLatestBlockhash(this.cfg.commitment);
    tx.recentBlockhash = blockhash;

    // Serialize WITHOUT signing — no signature is required or produced here.
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

    return {
      transactionBase64: serialized.toString('base64'),
      destinationAta: toAta.toBase58(),
      baseUnits: baseUnits.toString(),
      amountUsdc,
      mint: this.cfg.usdcMint,
    };
  }
}
