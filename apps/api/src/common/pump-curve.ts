import { createHash } from 'crypto';
import { PublicKey } from '@solana/web3.js';

/**
 * Reading pump.fun tokens straight from the chain.
 *
 * pump.fun's own read API now sits behind a Cloudflare bot challenge, so the
 * numbers that price a trade — reserves, price, whether the token graduated —
 * come from the token's bonding-curve account instead. That account is the
 * source of truth pump.fun itself trades against, read through our own RPC.
 */
export const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/** Every pump.fun mint has 6 decimals. */
export const PUMP_DECIMALS = 6;

const CURVE_DISCRIMINATOR = createHash('sha256').update('account:BondingCurve').digest().subarray(0, 8);
/** Token-2022 extension type for embedded token metadata. */
const TOKEN_METADATA_EXTENSION = 19;

export interface CurveState {
  /** Raw token units (6 dp). */
  virtualTokenReserves: number;
  /** Lamports. */
  virtualSolReserves: number;
  realTokenReserves: number;
  realSolReserves: number;
  tokenTotalSupply: number;
  /** True once the token graduated off the curve. */
  complete: boolean;
  creator: string | null;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
}

export function bondingCurveAddress(mint: string | PublicKey): PublicKey {
  const key = typeof mint === 'string' ? new PublicKey(mint) : mint;
  return PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), key.toBuffer()], PUMP_PROGRAM_ID)[0];
}

export function metaplexMetadataAddress(mint: string | PublicKey): PublicKey {
  const key = typeof mint === 'string' ? new PublicKey(mint) : mint;
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), key.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];
}

/**
 * BondingCurve account: 8-byte discriminator, five u64s, a bool, then the
 * creator (added in 2025, so older accounts may end before it).
 */
export function decodeBondingCurve(data: Buffer): CurveState | null {
  if (data.length < 49 || !data.subarray(0, 8).equals(CURVE_DISCRIMINATOR)) return null;
  // u64 → number is exact here: supply is 1e15 raw units, below 2^53.
  const u64 = (offset: number) => Number(data.readBigUInt64LE(offset));
  return {
    virtualTokenReserves: u64(8),
    virtualSolReserves: u64(16),
    realTokenReserves: u64(24),
    realSolReserves: u64(32),
    tokenTotalSupply: u64(40),
    complete: data[48] === 1,
    creator: data.length >= 81 ? new PublicKey(data.subarray(49, 81)).toBase58() : null,
  };
}

/** Metaplex metadata: key, update authority, mint, then Borsh name / symbol / uri (null-padded). */
export function decodeMetaplexMetadata(data: Buffer): TokenMetadata | null {
  try {
    const read = borshStrings(data, 1 + 32 + 32);
    return { name: read(), symbol: read(), uri: read() };
  } catch {
    return null;
  }
}

/**
 * Token-2022 mints (pump.fun's create_v2) carry their metadata in the mint
 * account itself: the 82-byte base mint padded to 165, an account-type byte,
 * then type-length-value extensions.
 */
export function decodeToken2022Metadata(data: Buffer): TokenMetadata | null {
  if (data.length <= 166 || data[165] !== 1) return null;
  try {
    let offset = 166;
    while (offset + 4 <= data.length) {
      const type = data.readUInt16LE(offset);
      const length = data.readUInt16LE(offset + 2);
      offset += 4;
      if (type === 0) break; // uninitialized: the rest is padding
      if (type === TOKEN_METADATA_EXTENSION) {
        // update authority (32), mint (32), then name / symbol / uri.
        const read = borshStrings(data.subarray(offset, offset + length), 64);
        return { name: read(), symbol: read(), uri: read() };
      }
      offset += length;
    }
  } catch {
    /* truncated or foreign layout */
  }
  return null;
}

function borshStrings(data: Buffer, start: number): () => string {
  let offset = start;
  return () => {
    const length = data.readUInt32LE(offset);
    offset += 4;
    if (offset + length > data.length) throw new RangeError('string runs past the account');
    const value = data.subarray(offset, offset + length).toString('utf8').replace(/\0+$/, '').trim();
    offset += length;
    return value;
  };
}
