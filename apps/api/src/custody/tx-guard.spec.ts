import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { PUMP_PROGRAM, TradeIntent, anchorDiscriminator, assertSafeTradeTransaction } from './tx-guard';

const wallet = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const attacker = Keypair.generate().publicKey;
const pump = new PublicKey(PUMP_PROGRAM);
const blockhash = Keypair.generate().publicKey.toBase58();

const u64 = (n: number | bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

/** A pump.fun instruction with the real account layout: mint at index 2, user at 6. */
function pumpIx(name: 'buy' | 'sell' | 'buy_exact_sol_in', a: number | bigint, b: number | bigint, onMint = mint) {
  const filler = () => ({ pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true });
  return new TransactionInstruction({
    programId: pump,
    keys: [filler(), filler(), { pubkey: onMint, isSigner: false, isWritable: false }, filler(), filler(), filler(),
      { pubkey: wallet, isSigner: true, isWritable: true }],
    data: Buffer.concat([anchorDiscriminator(name), u64(a), u64(b)]),
  });
}

function encode(instructions: TransactionInstruction[], payer = wallet): string {
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

const buyIntent: TradeIntent = { wallet: wallet.toBase58(), action: 'buy', mint: mint.toBase58(), solNotional: 0.5, slippageBps: 100 };
const sellIntent: TradeIntent = { ...buyIntent, action: 'sell', solNotional: 0.4 };

/** What a well-formed PumpPortal buy looks like: budget, fee transfer, the trade. */
const legitBuy = () => [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
  SystemProgram.transfer({ fromPubkey: wallet, toPubkey: Keypair.generate().publicKey, lamports: 0.0025 * LAMPORTS_PER_SOL }),
  pumpIx('buy', 1_000_000, 0.505 * LAMPORTS_PER_SOL),
];

describe('assertSafeTradeTransaction', () => {
  it('matches the published pump.fun discriminators', () => {
    expect([...anchorDiscriminator('buy')]).toEqual([102, 6, 61, 18, 1, 218, 235, 234]);
    expect([...anchorDiscriminator('sell')]).toEqual([51, 230, 133, 164, 1, 127, 131, 173]);
  });

  it('passes a well-formed buy', () => {
    expect(() => assertSafeTradeTransaction(encode(legitBuy()), buyIntent)).not.toThrow();
  });

  it('passes buy_exact_sol_in within the requested size', () => {
    const tx = encode([pumpIx('buy_exact_sol_in', 0.5 * LAMPORTS_PER_SOL, 1)]);
    expect(() => assertSafeTradeTransaction(tx, buyIntent)).not.toThrow();
  });

  it('passes a well-formed sell', () => {
    expect(() => assertSafeTradeTransaction(encode([pumpIx('sell', 1_000_000, 1)]), sellIntent)).not.toThrow();
  });

  it('refuses when someone else pays the fee', () => {
    expect(() => assertSafeTradeTransaction(encode(legitBuy().slice(3), attacker), buyIntent)).toThrow(/fee payer/);
  });

  it('refuses a SOL transfer that drains the wallet', () => {
    const tx = encode([...legitBuy(), SystemProgram.transfer({ fromPubkey: wallet, toPubkey: attacker, lamports: 3 * LAMPORTS_PER_SOL })]);
    expect(() => assertSafeTradeTransaction(tx, buyIntent)).toThrow(/fee allowance/);
  });

  it('refuses System instructions other than Transfer', () => {
    const tx = encode([...legitBuy(), SystemProgram.assign({ accountPubkey: wallet, programId: attacker })]);
    expect(() => assertSafeTradeTransaction(tx, buyIntent)).toThrow(/System program/);
  });

  it('refuses a buy that may spend more than requested', () => {
    const tx = encode([pumpIx('buy', 1_000_000, 5 * LAMPORTS_PER_SOL)]);
    expect(() => assertSafeTradeTransaction(tx, buyIntent)).toThrow(/may spend up to 5 SOL/);
  });

  it('refuses a trade on a different mint', () => {
    const tx = encode([pumpIx('buy', 1_000_000, 0.5 * LAMPORTS_PER_SOL, attacker)]);
    expect(() => assertSafeTradeTransaction(tx, buyIntent)).toThrow(/targets/);
  });

  it('refuses a sell when a buy was asked for', () => {
    expect(() => assertSafeTradeTransaction(encode([pumpIx('sell', 1, 1)]), buyIntent)).toThrow(/sell for a buy/);
  });

  it('refuses unknown programs unless explicitly allowed', () => {
    const other = Keypair.generate().publicKey;
    const ix = new TransactionInstruction({ programId: other, keys: [], data: Buffer.from([1]) });
    const tx = encode([...legitBuy(), ix]);
    expect(() => assertSafeTradeTransaction(tx, buyIntent)).toThrow(/unexpected program/);
    expect(() => assertSafeTradeTransaction(tx, { ...buyIntent, extraPrograms: [other.toBase58()] })).not.toThrow();
  });

  it('refuses a transaction with no trade in it', () => {
    expect(() => assertSafeTradeTransaction(encode(legitBuy().slice(0, 3)), buyIntent)).toThrow(/no pump.fun trade/);
  });

  it('refuses a runaway priority fee', () => {
    const tx = encode([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000_000_000 }), pumpIx('sell', 1, 1)]);
    expect(() => assertSafeTradeTransaction(tx, sellIntent)).toThrow(/priority fee/);
  });

  it('refuses truncated instruction data instead of crashing', () => {
    const ix = new TransactionInstruction({ programId: SystemProgram.programId, keys: [], data: Buffer.from([2, 0, 0, 0, 1]) });
    expect(() => assertSafeTradeTransaction(encode([ix, pumpIx('sell', 1, 1)]), sellIntent)).toThrow(/Refused to sign/);
  });

  it('refuses bytes that are not a transaction', () => {
    expect(() => assertSafeTradeTransaction(Buffer.from('<html>502</html>').toString('base64'), buyIntent)).toThrow(/decoded/);
  });
});
