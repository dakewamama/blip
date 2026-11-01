import { createHash } from 'crypto';
import { LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';

/**
 * Inspect a trade transaction before the custodial wallet signs it.
 *
 * The transaction comes from PumpPortal, a third party. Signing whatever it
 * returns would hand that service — or anyone who compromises it — the keys to
 * every wallet blip holds. So nothing is signed unless it is recognisably the
 * trade the user asked for:
 *
 *  - blip's wallet pays the fee and is the only signer
 *  - every invoked program is on an allowlist, with only harmless instructions
 *  - the pump.fun instruction is a buy/sell (matching the request) on the
 *    requested mint, and a buy cannot spend more than amount × slippage
 *  - plain SOL transfers out (PumpPortal's fee, tips) are capped
 *  - the priority fee is capped
 *
 * Fail closed: anything unrecognised is refused, not waved through.
 */

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Anchor instruction discriminator: first 8 bytes of sha256("global:<name>"). */
export function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

const PUMP_BUY = anchorDiscriminator('buy');
const PUMP_BUY_EXACT_SOL_IN = anchorDiscriminator('buy_exact_sol_in');
const PUMP_SELL = anchorDiscriminator('sell');

/** Index of the mint in pump.fun's buy and sell account lists. */
const PUMP_MINT_ACCOUNT = 2;

/** Flat allowance for fee/tip transfers, plus a share of the trade's SOL size. */
const TRANSFER_ALLOWANCE_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;
const TRANSFER_ALLOWANCE_SHARE = 0.02;
/** Headroom over amount × (1 + slippage) for the pump buy's SOL ceiling. */
const BUY_COST_HEADROOM = 1.05;
const MAX_PRIORITY_FEE_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;
/** Solana's default compute budget when a transaction does not set one. */
const DEFAULT_COMPUTE_UNITS = 1_400_000;

export interface TradeIntent {
  wallet: string;
  action: 'buy' | 'sell';
  mint: string;
  /** SOL in for a buy, expected SOL out for a sell — sizes the transfer allowance. */
  solNotional: number;
  slippageBps: number;
  /** Programs the operator has explicitly allowed on top of the built-in list. */
  extraPrograms?: string[];
}

export class UnsafeTransactionError extends Error {
  constructor(reason: string) {
    super(`Refused to sign: ${reason}`);
    this.name = 'UnsafeTransactionError';
  }
}

export function assertSafeTradeTransaction(base64Tx: string, intent: TradeIntent): void {
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(base64Tx, 'base64'));
  } catch {
    throw new UnsafeTransactionError('the trade transaction could not be decoded');
  }

  const message = tx.message;
  const keys = message.staticAccountKeys.map((k) => k.toBase58());
  const staticKey = (index: number): string | null => (index < keys.length ? keys[index] : null);

  if (keys[0] !== intent.wallet) {
    throw new UnsafeTransactionError(`fee payer is ${keys[0]}, not the custodial wallet`);
  }
  if (message.header.numRequiredSignatures !== 1) {
    throw new UnsafeTransactionError(`expects ${message.header.numRequiredSignatures} signers, not 1`);
  }

  const extra = new Set(intent.extraPrograms ?? []);
  const maxBuyLamports =
    intent.solNotional * LAMPORTS_PER_SOL * (1 + intent.slippageBps / 10_000) * BUY_COST_HEADROOM + 10_000;
  const transferAllowance =
    TRANSFER_ALLOWANCE_LAMPORTS + intent.solNotional * LAMPORTS_PER_SOL * TRANSFER_ALLOWANCE_SHARE;

  let outflowLamports = 0;
  let pumpInstructions = 0;
  let unitLimit = DEFAULT_COMPUTE_UNITS;
  let microLamportsPerUnit = 0;

  for (const ix of message.compiledInstructions) {
    try {
      inspect(ix);
    } catch (error) {
      if (error instanceof UnsafeTransactionError) throw error;
      // A Buffer read past the end: truncated instruction data.
      throw new UnsafeTransactionError('malformed instruction data');
    }
  }

  function inspect(ix: (typeof message.compiledInstructions)[number]): void {
    const program = keys[ix.programIdIndex];
    const data = Buffer.from(ix.data);
    const account = (i: number) => staticKey(ix.accountKeyIndexes[i]);

    switch (program) {
      case COMPUTE_BUDGET_PROGRAM: {
        // 2 = SetComputeUnitLimit(u32), 3 = SetComputeUnitPrice(u64 micro-lamports).
        if (data[0] === 2) unitLimit = data.readUInt32LE(1);
        else if (data[0] === 3) microLamportsPerUnit = Number(data.readBigUInt64LE(1));
        break;
      }

      case SYSTEM_PROGRAM: {
        // Only Transfer (2). Assign, CreateAccount etc. would hand the wallet away.
        if (data.length < 12 || data.readUInt32LE(0) !== 2) {
          throw new UnsafeTransactionError('unexpected System program instruction');
        }
        if (account(1) !== intent.wallet) outflowLamports += Number(data.readBigUInt64LE(4));
        break;
      }

      case ATA_PROGRAM: {
        // Create (empty or 0) / CreateIdempotent (1) only.
        if (data.length > 1 || (data.length === 1 && data[0] > 1)) {
          throw new UnsafeTransactionError('unexpected associated-token instruction');
        }
        break;
      }

      case TOKEN_PROGRAM:
      case TOKEN_2022_PROGRAM: {
        // CloseAccount (9) back to the wallet is the only top-level token op a
        // trade needs; a Transfer here would move the user's tokens elsewhere.
        if (data[0] !== 9 || account(1) !== intent.wallet) {
          throw new UnsafeTransactionError('unexpected token-program instruction');
        }
        break;
      }

      case PUMP_PROGRAM: {
        pumpInstructions++;
        const discriminator = data.subarray(0, 8);
        const mint = account(PUMP_MINT_ACCOUNT);
        if (mint !== intent.mint) {
          throw new UnsafeTransactionError(`pump.fun instruction targets ${mint ?? 'an unresolvable mint'}, not ${intent.mint}`);
        }

        if (discriminator.equals(PUMP_BUY) || discriminator.equals(PUMP_BUY_EXACT_SOL_IN)) {
          if (intent.action !== 'buy') throw new UnsafeTransactionError('got a buy for a sell request');
          // buy(amount, max_sol_cost) / buy_exact_sol_in(spendable_sol_in, min_tokens_out)
          const solCeiling = Number(
            discriminator.equals(PUMP_BUY) ? data.readBigUInt64LE(16) : data.readBigUInt64LE(8),
          );
          if (solCeiling > maxBuyLamports) {
            throw new UnsafeTransactionError(
              `buy may spend up to ${solCeiling / LAMPORTS_PER_SOL} SOL, more than the ${intent.solNotional} SOL requested`,
            );
          }
        } else if (discriminator.equals(PUMP_SELL)) {
          if (intent.action !== 'sell') throw new UnsafeTransactionError('got a sell for a buy request');
        } else {
          throw new UnsafeTransactionError('unexpected pump.fun instruction');
        }
        break;
      }

      default:
        if (!extra.has(program)) throw new UnsafeTransactionError(`unexpected program ${program}`);
    }
  }

  if (pumpInstructions === 0) {
    throw new UnsafeTransactionError('no pump.fun trade instruction');
  }
  if (outflowLamports > transferAllowance) {
    throw new UnsafeTransactionError(
      `sends ${outflowLamports / LAMPORTS_PER_SOL} SOL to other accounts, above the fee allowance`,
    );
  }
  const priorityLamports = (unitLimit * microLamportsPerUnit) / 1_000_000;
  if (priorityLamports > MAX_PRIORITY_FEE_LAMPORTS) {
    throw new UnsafeTransactionError(`priority fee of ${priorityLamports / LAMPORTS_PER_SOL} SOL is too high`);
  }
}
