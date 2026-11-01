import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { PublicKey } from '@solana/web3.js';
import { TtlCache } from './cache';
import { SolanaService, TOKEN_2022_PROGRAM } from './solana.service';
import { PricesService } from './prices.service';
import { NormalizedToken } from './normalize';
import {
  GECKOTERMINAL_API,
  GECKOTERMINAL_PAGE_SIZE,
  Listing,
  PUMP_FUN_DEX,
  listingsFromPools,
} from './geckoterminal';
import {
  CurveState,
  PUMP_DECIMALS,
  TokenMetadata,
  bondingCurveAddress,
  decodeBondingCurve,
  decodeMetaplexMetadata,
  decodeToken2022Metadata,
  metaplexMetadataAddress,
} from './pump-curve';

export type ListOrder = 'active' | 'new';

const LAMPORTS = 1_000_000_000;
/** The free GeckoTerminal tier allows a few dozen calls a minute; lists never go deeper than this. */
const MAX_PAGES = 3;
const RPC_BATCH = 100;

/**
 * pump.fun market data without pump.fun's read API, which now answers every
 * server with a Cloudflare bot challenge.
 *
 *  - Discovery (which tokens, their names and art, when they launched) comes
 *    from GeckoTerminal's public API, cached hard and served stale when it
 *    rate-limits.
 *  - Everything a trade depends on — reserves, price, graduation — is read
 *    from each token's bonding-curve account through our own RPC.
 *  - A token GeckoTerminal has not listed is still resolvable: its name and
 *    symbol come from on-chain metadata.
 *
 * Every token comes out as the same NormalizedToken the rest of the API used
 * to get from pump.fun.
 */
@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly pages = new TtlCache<Listing[]>(60_000, 50);
  /** Last good page per key, for when GeckoTerminal says no. */
  private readonly stalePages = new Map<string, Listing[]>();
  /** Everything discovery has told us about a mint. Names and launch times don't change. */
  private readonly listings = new TtlCache<Listing>(6 * 3_600_000, 5_000);
  private readonly lookups = new TtlCache<Listing | null>(3_600_000, 2_000);
  private readonly searches = new TtlCache<Listing[]>(30_000, 200);
  private readonly art = new TtlCache<{ image?: string; description?: string }>(6 * 3_600_000, 2_000);
  /**
   * Curve state shared across lists for a few seconds, so trending, featured
   * and gainers over the same tokens cost one RPC read. Quotes read fresh.
   */
  private readonly curves = new TtlCache<CurveState | null>(10_000, 5_000);

  constructor(
    private readonly solana: SolanaService,
    private readonly prices: PricesService,
  ) {}

  /** Tokens still on the curve, most traded (24h volume) or newest first. */
  async list(order: ListOrder, count: number, offset = 0): Promise<NormalizedToken[]> {
    const first = Math.floor(offset / GECKOTERMINAL_PAGE_SIZE) + 1;
    const pageCount = Math.min(MAX_PAGES, Math.max(1, Math.ceil(count / GECKOTERMINAL_PAGE_SIZE)));
    const results = await Promise.allSettled(
      Array.from({ length: pageCount }, (_, i) => this.page(order, first + i)),
    );
    const listings = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (listings.length === 0 && results.every((r) => r.status === 'rejected')) {
      throw new ServiceUnavailableException('Market data is unavailable right now');
    }
    return this.withCurves(dedupe(listings));
  }

  /** Name / symbol search across pump.fun curves. */
  async search(term: string, limit: number): Promise<NormalizedToken[]> {
    const key = term.trim().toLowerCase();
    const listings = await this.searches.wrap(key, async () => {
      const body = await this.gecko('/search/pools', { query: key, network: 'solana', include: 'base_token,dex' });
      return this.remember(listingsFromPools(body));
    });
    return (await this.withCurves(dedupe(listings))).slice(0, limit);
  }

  /** One token by mint, or null if it has no pump.fun bonding curve. */
  async token(mint: string): Promise<NormalizedToken | null> {
    const listing = this.listings.get(mint) ?? (await this.lookup(mint));
    const [token] = await this.withCurves([listing ?? (await this.onChainListing([mint])).get(mint) ?? bare(mint)], true);
    return token ?? null;
  }

  /**
   * Many tokens at once (a wallet's holdings). Unlisted mints are named from
   * on-chain metadata rather than one GeckoTerminal call each, so a wallet
   * full of dust cannot burn the rate limit.
   */
  async tokens(mints: string[]): Promise<Map<string, NormalizedToken>> {
    const unknown = mints.filter((m) => !this.listings.get(m));
    const fromChain = unknown.length ? await this.onChainListing(unknown) : new Map<string, Listing>();
    const listings = mints.map((m) => this.listings.get(m) ?? fromChain.get(m) ?? bare(m));
    const tokens = await this.withCurves(listings);
    return new Map(tokens.map((t) => [t.mint, t]));
  }

  /**
   * GeckoTerminal pool id for price history. On the curve that is the curve
   * account itself, which saves a lookup; null means look it up (graduated).
   */
  async curvePool(mint: string): Promise<string | null> {
    const address = bondingCurveAddress(mint);
    const info = await this.solana.connection.getAccountInfo(address);
    const curve = info ? decodeBondingCurve(info.data) : null;
    return curve && !curve.complete ? address.toBase58() : null;
  }

  /** Whether discovery is answering (a cached page counts). */
  async healthy(): Promise<boolean> {
    try {
      return (await this.page('active', 1)).length > 0;
    } catch {
      return false;
    }
  }

  private page(order: ListOrder, page: number): Promise<Listing[]> {
    const key = `${order}:${page}`;
    return this.pages.wrap(key, async () => {
      try {
        // The dex listing only sorts by activity; "new" comes from the
        // all-dex newest-pools feed, filtered to pump.fun curves.
        const body =
          order === 'new'
            ? await this.gecko('/networks/solana/new_pools', { page, include: 'base_token,dex' })
            : await this.gecko(`/networks/solana/dexes/${PUMP_FUN_DEX}/pools`, {
                page,
                sort: 'h24_volume_usd_desc',
                include: 'base_token',
              });
        const listings = this.remember(listingsFromPools(body));
        this.stalePages.set(key, listings);
        return listings;
      } catch (error) {
        const stale = this.stalePages.get(key);
        if (stale) return stale;
        throw error;
      }
    });
  }

  /** GeckoTerminal's record for one curve: name, art and launch time in a single call. */
  private lookup(mint: string): Promise<Listing | null> {
    return this.lookups.wrap(mint, async () => {
      try {
        const body = await this.gecko(`/networks/solana/pools/${bondingCurveAddress(mint).toBase58()}`, {
          include: 'base_token',
        });
        const [listing] = this.remember(listingsFromPools({ data: [body?.data], included: body?.included }));
        return listing ?? null;
      } catch {
        return null; // fall back to on-chain metadata
      }
    });
  }

  private async gecko(path: string, params: Record<string, unknown>): Promise<any> {
    const { data } = await axios.get(`${GECKOTERMINAL_API}${path}`, {
      params,
      timeout: 8000,
      headers: { Accept: 'application/json' },
    });
    return data;
  }

  private remember(listings: Listing[]): Listing[] {
    for (const listing of listings) this.listings.set(listing.mint, listing);
    return listings;
  }

  /**
   * Read each listing's bonding curve and price it. Mints without a curve are
   * dropped; a curve read that fails outright throws rather than returning an
   * empty list that would look like "no tokens".
   */
  private async withCurves(listings: Listing[], fresh = false): Promise<NormalizedToken[]> {
    const need = fresh ? listings : listings.filter((l) => this.curves.get(l.mint) === undefined);
    if (need.length) {
      const accounts = await this.readAccounts(need.map((l) => bondingCurveAddress(l.mint)), true);
      need.forEach((l, i) => {
        const account = accounts[i];
        this.curves.set(l.mint, account ? decodeBondingCurve(account.data) : null);
      });
    }
    const solUsd = this.prices.getSolUsd().price;
    const out: NormalizedToken[] = [];
    for (const listing of listings) {
      const curve = this.curves.get(listing.mint);
      if (curve) out.push(toToken(listing, curve, solUsd));
    }
    return out;
  }

  /** Names for mints discovery has never seen, from Token-2022 or Metaplex metadata. */
  private async onChainListing(mints: string[]): Promise<Map<string, Listing>> {
    const out = new Map<string, Listing>();
    const valid = mints.filter((m) => this.solana.isValidAddress(m));
    const mintAccounts = await this.readAccounts(valid.map((m) => new PublicKey(m)));

    const metadata = new Map<string, TokenMetadata>();
    const legacy: string[] = [];
    valid.forEach((mint, i) => {
      const account = mintAccounts[i];
      const embedded = account?.owner.equals(TOKEN_2022_PROGRAM) ? decodeToken2022Metadata(account.data) : null;
      if (embedded) metadata.set(mint, embedded);
      else legacy.push(mint);
    });
    if (legacy.length) {
      const accounts = await this.readAccounts(legacy.map((m) => metaplexMetadataAddress(m)));
      legacy.forEach((mint, i) => {
        const account = accounts[i];
        const decoded = account ? decodeMetaplexMetadata(account.data) : null;
        if (decoded) metadata.set(mint, decoded);
      });
    }

    await Promise.all(
      [...metadata].map(async ([mint, meta]) => {
        const art = await this.offChainArt(meta.uri);
        const listing: Listing = {
          mint,
          name: meta.name || 'Unknown',
          symbol: meta.symbol || mint.slice(0, 4),
          imageUri: art.image,
          description: art.description,
          createdAt: 0,
        };
        out.set(mint, listing);
      }),
    );
    return out;
  }

  /** The metadata URI's JSON (usually IPFS) holds the image. Best effort, never blocks a listing. */
  private offChainArt(uri: string): Promise<{ image?: string; description?: string }> {
    if (!/^https?:\/\//.test(uri)) return Promise.resolve({});
    return this.art.wrap(uri, async () => {
      try {
        const { data } = await axios.get(uri, { timeout: 3000, maxContentLength: 64 * 1024 });
        return {
          image: typeof data?.image === 'string' ? data.image : undefined,
          description: typeof data?.description === 'string' ? data.description : undefined,
        };
      } catch {
        return {};
      }
    });
  }

  /**
   * getMultipleAccountsInfo in RPC-sized chunks, index-aligned with `keys`.
   * A rate-limited RPC gets two quick retries; after that `strict` reads throw
   * and best-effort ones (names) come back empty.
   */
  private async readAccounts(keys: PublicKey[], strict = false): Promise<({ data: Buffer; owner: PublicKey } | null)[]> {
    const out: ({ data: Buffer; owner: PublicKey } | null)[] = [];
    for (let i = 0; i < keys.length; i += RPC_BATCH) {
      const chunk = keys.slice(i, i + RPC_BATCH);
      for (let attempt = 0; ; attempt++) {
        try {
          const infos = await this.solana.connection.getMultipleAccountsInfo(chunk);
          for (const info of infos) out.push(info ? { data: Buffer.from(info.data), owner: info.owner } : null);
          break;
        } catch (error: any) {
          if (attempt < 2 && /429/.test(error.message)) {
            await new Promise((resolve) => setTimeout(resolve, 400 * 3 ** attempt));
            continue;
          }
          this.logger.warn(`Account read failed for ${chunk.length} keys: ${error.message}`);
          if (strict) throw new ServiceUnavailableException('Could not read token prices from the chain right now');
          out.push(...chunk.map(() => null));
          break;
        }
      }
    }
    return out;
  }
}

function dedupe(listings: Listing[]): Listing[] {
  return Array.from(new Map(listings.map((l) => [l.mint, l])).values());
}

function bare(mint: string): Listing {
  return { mint, name: 'Unknown', symbol: mint.slice(0, 4), createdAt: 0 };
}

function toToken(listing: Listing, curve: CurveState, solUsd: number): NormalizedToken {
  const priceSol =
    curve.virtualTokenReserves > 0
      ? curve.virtualSolReserves / LAMPORTS / (curve.virtualTokenReserves / 10 ** PUMP_DECIMALS)
      : 0;
  return {
    mint: listing.mint,
    name: listing.name,
    symbol: listing.symbol,
    description: listing.description,
    imageUri: listing.imageUri,
    creator: curve.creator ?? '',
    bondingCurve: bondingCurveAddress(listing.mint).toBase58(),
    createdAt: listing.createdAt,
    complete: curve.complete,
    isLive: false,
    nsfw: false,
    virtualSolReserves: curve.virtualSolReserves,
    virtualTokenReserves: curve.virtualTokenReserves,
    realSolReserves: curve.realSolReserves,
    totalSupply: curve.tokenTotalSupply,
    baseDecimals: PUMP_DECIMALS,
    priceSol,
    marketCapUsd: priceSol * (curve.tokenTotalSupply / 10 ** PUMP_DECIMALS) * solUsd,
    replyCount: 0,
    raw: { source: 'chain', bondingCurve: bondingCurveAddress(listing.mint).toBase58() },
  };
}
