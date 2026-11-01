import { createHash } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { listingsFromPools } from './geckoterminal';
import {
  bondingCurveAddress,
  decodeBondingCurve,
  decodeMetaplexMetadata,
  decodeToken2022Metadata,
} from './pump-curve';

const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const borsh = (s: string, pad = 0) => {
  const bytes = Buffer.concat([Buffer.from(s, 'utf8'), Buffer.alloc(Math.max(0, pad - Buffer.byteLength(s)))]);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
};

describe('bonding curve', () => {
  it('derives the same curve address GeckoTerminal reports as the pool', () => {
    // A live pump.fun token and its pump-fun pool on GeckoTerminal.
    expect(bondingCurveAddress('4jsd8c93LhLZzfUNJXpC5sPCLJCGafJfxRiUJKKQpump').toBase58()).toBe(
      'DVaMjzifrvLjzxGVMkFbFGJPeAY6Tgkg38GTj4QZg3sj',
    );
  });

  it('decodes reserves, supply, graduation and creator', () => {
    const creator = Keypair.generate().publicKey;
    const data = Buffer.concat([
      createHash('sha256').update('account:BondingCurve').digest().subarray(0, 8),
      u64(BigInt('1053641323835242')),
      u64(BigInt('1988118550763')),
      u64(BigInt('773741323835242')),
      u64(BigInt('1863050')),
      u64(BigInt('1000000000000000')),
      Buffer.from([0]),
      creator.toBuffer(),
      Buffer.alloc(85),
    ]);
    expect(decodeBondingCurve(data)).toEqual({
      virtualTokenReserves: 1053641323835242,
      virtualSolReserves: 1988118550763,
      realTokenReserves: 773741323835242,
      realSolReserves: 1863050,
      tokenTotalSupply: 1000000000000000,
      complete: false,
      creator: creator.toBase58(),
    });
  });

  it('rejects accounts that are not a bonding curve', () => {
    expect(decodeBondingCurve(Buffer.alloc(150))).toBeNull();
    expect(decodeBondingCurve(Buffer.alloc(10))).toBeNull();
  });
});

describe('token metadata', () => {
  it('reads Metaplex metadata and strips null padding', () => {
    const data = Buffer.concat([Buffer.from([4]), Buffer.alloc(64), borsh('Santa Mode', 32), borsh('SANTA', 10), borsh('https://ipfs.io/ipfs/x', 200)]);
    expect(decodeMetaplexMetadata(data)).toEqual({ name: 'Santa Mode', symbol: 'SANTA', uri: 'https://ipfs.io/ipfs/x' });
  });

  it('reads Token-2022 embedded metadata past other extensions', () => {
    const value = Buffer.concat([Buffer.alloc(64), borsh('Kite Coin'), borsh('KITE'), borsh('https://x.y/m.json'), Buffer.alloc(4)]);
    const tlv = (type: number, body: Buffer) => {
      const head = Buffer.alloc(4);
      head.writeUInt16LE(type, 0);
      head.writeUInt16LE(body.length, 2);
      return Buffer.concat([head, body]);
    };
    const data = Buffer.concat([Buffer.alloc(165), Buffer.from([1]), tlv(18, Buffer.alloc(64)), tlv(19, value)]);
    expect(decodeToken2022Metadata(data)).toEqual({ name: 'Kite Coin', symbol: 'KITE', uri: 'https://x.y/m.json' });
  });

  it('returns null for a plain mint or a truncated extension', () => {
    expect(decodeToken2022Metadata(Buffer.alloc(82))).toBeNull();
    const truncated = Buffer.concat([Buffer.alloc(165), Buffer.from([1, 19, 0, 200, 0]), Buffer.alloc(10)]);
    expect(decodeToken2022Metadata(truncated)).toBeNull();
  });
});

describe('listingsFromPools', () => {
  const body = {
    data: [
      {
        attributes: { pool_created_at: '2026-11-01T19:38:45Z' },
        relationships: { base_token: { data: { id: 'solana_AAApump' } }, dex: { data: { id: 'pump-fun' } } },
      },
      {
        attributes: { pool_created_at: '2026-10-01T00:00:00Z' },
        relationships: { base_token: { data: { id: 'solana_BBB' } }, dex: { data: { id: 'raydium' } } },
      },
      {
        attributes: { pool_created_at: '2026-11-01T20:00:00Z' },
        relationships: {
          base_token: { data: { id: 'solana_DDDpump' } },
          quote_token: { data: { id: 'solana_RDDTxyz' } },
          dex: { data: { id: 'pump-fun' } },
        },
      },
      {
        attributes: { pool_created_at: 'garbage' },
        relationships: { base_token: { data: { id: 'solana_CCCpump' } } },
      },
    ],
    included: [
      { id: 'solana_AAApump', type: 'token', attributes: { name: 'Santa Mode', symbol: 'SANTAMODE', image_url: 'https://assets.geckoterminal.com/a' } },
      { id: 'solana_CCCpump', type: 'token', attributes: { name: '', symbol: '', image_url: 'missing.png' } },
    ],
  };

  it('keeps SOL-quoted pump.fun curves only, with names, art and launch time', () => {
    expect(listingsFromPools(body)).toEqual([
      { mint: 'AAApump', name: 'Santa Mode', symbol: 'SANTAMODE', imageUri: 'https://assets.geckoterminal.com/a', createdAt: Date.parse('2026-11-01T19:38:45Z') },
      { mint: 'CCCpump', name: 'Unknown', symbol: 'CCCp', imageUri: undefined, createdAt: 0 },
    ]);
  });

  it('tolerates an empty or malformed body', () => {
    expect(listingsFromPools(undefined)).toEqual([]);
    expect(listingsFromPools({ data: [{}] })).toEqual([]);
  });
});
