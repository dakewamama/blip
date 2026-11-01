/**
 * GeckoTerminal's public API: which pump.fun tokens exist, what they are
 * called, and when they launched. It indexes the bonding curve as a "pump-fun"
 * dex whose pool address is the curve account itself. Prices are deliberately
 * NOT taken from here — the chain is read for those (see pump-curve.ts).
 */
export const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';
export const PUMP_FUN_DEX = 'pump-fun';
export const GECKOTERMINAL_PAGE_SIZE = 20;
const WRAPPED_SOL = 'solana_So11111111111111111111111111111111111111112';

/** What discovery knows about a token before its curve has been read. */
export interface Listing {
  mint: string;
  name: string;
  symbol: string;
  imageUri?: string;
  description?: string;
  /** Milliseconds since epoch; 0 when unknown. */
  createdAt: number;
}

/**
 * Pools response (with `include=base_token`) → listings, keeping only
 * pump.fun bonding-curves quoted in SOL. Search and new-pool results mix
 * every Solana dex, so the dex filter matters there; and pump.fun now also
 * runs curves quoted in other tokens, which blip's SOL-denominated quotes and
 * trades cannot price.
 */
export function listingsFromPools(body: any): Listing[] {
  const tokens = new Map<string, any>();
  for (const item of body?.included ?? []) {
    if (item?.type === 'token') tokens.set(item.id, item.attributes ?? {});
  }

  const out: Listing[] = [];
  for (const pool of body?.data ?? []) {
    const dex = pool?.relationships?.dex?.data?.id;
    if (dex && dex !== PUMP_FUN_DEX) continue;
    const quote = pool?.relationships?.quote_token?.data?.id;
    if (quote && quote !== WRAPPED_SOL) continue;

    const tokenId: string | undefined = pool?.relationships?.base_token?.data?.id;
    if (!tokenId) continue;
    const mint = tokenId.replace(/^solana_/, '');
    const token = tokens.get(tokenId) ?? {};
    const created = Date.parse(pool?.attributes?.pool_created_at ?? '');

    out.push({
      mint,
      name: String(token.name ?? '').trim() || 'Unknown',
      symbol: String(token.symbol ?? '').trim() || mint.slice(0, 4),
      // GeckoTerminal answers "missing.png" for tokens it has no art for.
      imageUri: typeof token.image_url === 'string' && !token.image_url.includes('missing') ? token.image_url : undefined,
      createdAt: Number.isFinite(created) ? created : 0,
    });
  }
  return out;
}
