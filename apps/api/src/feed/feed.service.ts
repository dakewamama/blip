import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UpstreamService } from '../common/upstream.service';
import { PricesService } from '../common/prices.service';
import { SafetyService, SafetyReport } from '../safety/safety.service';
import { TtlCache } from '../common/cache';
import { NormalizedToken, ageLabel, normalizeToken } from '../common/normalize';
import { curveProgress } from '../common/curve';
import axios from 'axios';

export type HistoryTimeframe = 'minute' | 'hour' | 'day';

export interface HistoryPoint {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number;
}

export interface HistoryResult {
  points: HistoryPoint[];
  source: 'geckoterminal' | 'unavailable';
  poolId: string | null;
}

export type FeedFilter = 'trending' | 'new' | 'gainers' | 'safest' | 'featured';

export interface FeedToken {
  mint: string;
  name: string;
  symbol: string;
  imageUri?: string;
  age: string;
  createdAt: number;
  priceSol: number;
  priceUsd: number;
  marketCapUsd: number;
  liquiditySol: number;
  liquidityUsd: number;
  curveProgress: number;
  graduated: boolean;
  score: number | null;
  verdict: string | null;
  safetyComplete: boolean;
}

export interface FeedResult {
  tokens: FeedToken[];
  solUsd: number;
  solPriceStale: boolean;
  /** Tokens dropped for scoring below the floor. */
  hiddenByFloor: number;
  filter: FeedFilter;
}

/** Anything below this is kept out of the feed unless explicitly searched for. */
export const SAFETY_FLOOR = 40;

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  private readonly listCache = new TtlCache<NormalizedToken[]>(20_000, 32);
  private readonly historyCache = new TtlCache<HistoryResult>(30_000, 200);
  // Pool ids are permanent; only re-resolve occasionally.
  private readonly poolCache = new TtlCache<string | null>(30 * 60_000, 500);

  constructor(
    private readonly upstream: UpstreamService,
    private readonly prices: PricesService,
    private readonly safety: SafetyService,
  ) {}

  private async fetchList(filter: FeedFilter, limit: number, offset: number): Promise<NormalizedToken[]> {
    const key = `${filter}:${limit}:${offset}`;
    return this.listCache.wrap(key, async () => {
      const sort = filter === 'new' ? 'created_timestamp' : 'market_cap';
      const path = filter === 'featured' ? '/coins/king-of-the-hill' : '/coins';

      const raw = await this.upstream.get<any[]>(path, {
        offset,
        limit,
        sort,
        order: 'DESC',
        includeNsfw: false,
      });

      return (Array.isArray(raw) ? raw : []).map(normalizeToken).filter((t) => t.mint);
    });
  }

  async getFeed(
    filter: FeedFilter = 'trending',
    limit = 25,
    offset = 0,
    options: { includeUnsafe?: boolean; score?: boolean } = {},
  ): Promise<FeedResult> {
    const { includeUnsafe = false, score = true } = options;

    // Over-fetch so the safety floor does not leave a short page.
    const candidates = await this.fetchList(filter, Math.min(100, limit * 2), offset);
    const solPrice = this.prices.getSolUsd();

    let reports = new Map<string, SafetyReport>();
    if (score) {
      // Scoring costs 2 RPC calls per token, so only score the page being returned.
      reports = await this.safety.getReports(candidates.slice(0, limit + 5), 4);
    }

    let hiddenByFloor = 0;
    const mapped: FeedToken[] = [];

    for (const token of candidates) {
      const report = reports.get(token.mint) ?? null;

      if (!includeUnsafe && report && report.score < SAFETY_FLOOR) {
        hiddenByFloor++;
        continue;
      }

      mapped.push(this.toFeedToken(token, report, solPrice.price));
    }

    let tokens = mapped;
    if (filter === 'safest') {
      tokens = tokens.filter((t) => (t.score ?? 0) >= 75).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (filter === 'gainers') {
      // Curve progress is the honest proxy for momentum on a pre-graduation token.
      tokens = tokens.sort((a, b) => b.curveProgress - a.curveProgress);
    }

    return {
      tokens: tokens.slice(0, limit),
      solUsd: solPrice.price,
      solPriceStale: solPrice.stale,
      hiddenByFloor,
      filter,
    };
  }

  async getToken(mint: string): Promise<{ token: FeedToken; safety: SafetyReport | null; raw: NormalizedToken }> {
    const raw = await this.upstream.get<any>(`/coins/${mint}`);
    if (!raw || !raw.mint) throw new NotFoundException(`No pump.fun token for mint ${mint}`);

    const token = normalizeToken(raw);
    const [solPrice, safety] = await Promise.all([
      Promise.resolve(this.prices.getSolUsd()),
      this.safety.getReport(token).catch((error) => {
        this.logger.warn(`Safety report failed for ${mint}: ${error.message}`);
        return null;
      }),
    ]);

    return { token: this.toFeedToken(token, safety, solPrice.price), safety, raw: token };
  }

  /** Search never applies the safety floor — asking for a token by name is consent. */
  async search(query: string, limit = 20): Promise<FeedResult> {
    const term = query.trim().toLowerCase();
    if (!term) return { tokens: [], solUsd: 0, solPriceStale: true, hiddenByFloor: 0, filter: 'trending' };

    // A full mint address resolves directly rather than by scanning pages.
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query.trim())) {
      try {
        const { token } = await this.getToken(query.trim());
        const solPrice = this.prices.getSolUsd();
        return { tokens: [token], solUsd: solPrice.price, solPriceStale: solPrice.stale, hiddenByFloor: 0, filter: 'trending' };
      } catch {
        // fall through to a name search
      }
    }

    const pages = await Promise.all(
      [0, 1, 2].map((page) =>
        this.fetchList('trending', 100, page * 100).catch(() => [] as NormalizedToken[]),
      ),
    );

    const unique = Array.from(new Map(pages.flat().map((t) => [t.mint, t])).values());
    const matches = unique
      .filter(
        (t) =>
          t.symbol.toLowerCase().includes(term) ||
          t.name.toLowerCase().includes(term) ||
          t.mint.toLowerCase().startsWith(term),
      )
      .sort((a, b) => b.marketCapUsd - a.marketCapUsd)
      .slice(0, limit);

    const [solPrice, reports] = await Promise.all([
      Promise.resolve(this.prices.getSolUsd()),
      this.safety.getReports(matches),
    ]);

    return {
      tokens: matches.map((t) => this.toFeedToken(t, reports.get(t.mint) ?? null, solPrice.price)),
      solUsd: solPrice.price,
      solPriceStale: solPrice.stale,
      hiddenByFloor: 0,
      filter: 'trending',
    };
  }

  /**
   * Real price history for the detail chart.
   *
   * pump.fun's v3 mirror has no trades endpoint (the old `/trades/all/:mint`
   * path 404s, which also means the legacy TokensService trade methods return
   * nothing), so history comes from GeckoTerminal's OHLCV for the token's pool.
   * This is the only honest source available — the previous frontend drew a
   * seeded random walk that looked like history but was not.
   */
  async getHistory(
    mint: string,
    timeframe: HistoryTimeframe = 'minute',
    limit = 60,
  ): Promise<HistoryResult> {
    return this.historyCache.wrap(`${mint}:${timeframe}:${limit}`, async () => {
      try {
        const poolId = await this.resolvePool(mint);
        if (!poolId) return { points: [], source: 'unavailable', poolId: null };

        const { data } = await axios.get(
          `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolId}/ohlcv/${timeframe}`,
          { params: { limit: Math.min(limit, 1000) }, timeout: 8000 },
        );

        const list: number[][] = data?.data?.attributes?.ohlcv_list ?? [];
        const points = list
          .map(([t, open, high, low, close, volume]) => ({
            t: t * 1000,
            open,
            high,
            low,
            close,
            volumeUsd: volume,
          }))
          .filter((p) => Number.isFinite(p.close) && p.close > 0)
          .sort((a, b) => a.t - b.t);

        return { points, source: 'geckoterminal', poolId };
      } catch (error: any) {
        this.logger.warn(`History lookup failed for ${mint}: ${error.message}`);
        return { points: [], source: 'unavailable', poolId: null };
      }
    });
  }

  /** GeckoTerminal indexes by its own pool id, not pump.fun's pool_address. */
  private async resolvePool(mint: string): Promise<string | null> {
    return this.poolCache.wrap(mint, async () => {
      const { data } = await axios.get(
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools`,
        { timeout: 8000 },
      );
      const first = data?.data?.[0]?.id;
      if (typeof first !== 'string') return null;
      // Ids come back namespaced as "solana_<address>".
      return first.replace(/^solana_/, '');
    });
  }

  private toFeedToken(token: NormalizedToken, report: SafetyReport | null, solUsd: number): FeedToken {
    const liquiditySol = token.realSolReserves / 1e9;
    return {
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      imageUri: token.imageUri,
      age: ageLabel(token.createdAt),
      createdAt: token.createdAt,
      priceSol: token.priceSol,
      priceUsd: token.priceSol * solUsd,
      marketCapUsd: token.marketCapUsd,
      liquiditySol,
      liquidityUsd: liquiditySol * solUsd,
      curveProgress: curveProgress(token.realSolReserves),
      graduated: token.complete,
      score: report?.score ?? null,
      verdict: report?.verdict ?? null,
      safetyComplete: report?.complete ?? false,
    };
  }
}
