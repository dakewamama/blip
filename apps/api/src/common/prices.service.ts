import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';

export interface SolPrice {
  price: number;
  /** True when the number is older than one refresh interval. */
  stale: boolean;
  source: string;
  ageMs: number;
}

interface Source {
  name: string;
  fetch: () => Promise<number>;
}

const REFRESH_MS = 15_000;
/** Past this the quote is too old to put a dollar sign in front of. */
const MAX_AGE_MS = 5 * 60_000;

/**
 * SOL/USD.
 *
 * Two problems with the original: it returned a hardcoded 100 on failure, which
 * silently turns every dollar figure in the product into a plausible lie; and it
 * fetched on the request path, so a slow upstream became a slow API.
 *
 * This refreshes in the background and races several sources, so a request reads
 * a number that is already in memory. When every source is down it reports
 * price 0 with `stale: true` rather than inventing one.
 */
@Injectable()
export class PricesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PricesService.name);
  private last: { price: number; at: number; source: string } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<void> | null = null;

  private readonly sources: Source[] = [
    {
      name: 'jupiter',
      fetch: async () => {
        const { data } = await axios.get(
          'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112',
          { timeout: 4000 },
        );
        return Number(data?.['So11111111111111111111111111111111111111112']?.usdPrice);
      },
    },
    {
      name: 'coinbase',
      fetch: async () => {
        const { data } = await axios.get('https://api.coinbase.com/v2/prices/SOL-USD/spot', {
          timeout: 4000,
        });
        return Number(data?.data?.amount);
      },
    },
    {
      name: 'binance',
      fetch: async () => {
        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', {
          timeout: 4000,
        });
        return Number(data?.price);
      },
    },
    {
      name: 'coingecko',
      fetch: async () => {
        const { data } = await axios.get(
          'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
          { timeout: 4000 },
        );
        return Number(data?.solana?.usd);
      },
    },
  ];

  async onModuleInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, REFRESH_MS);
    // Do not hold the process open just for a price ticker.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Reads memory. Never makes a network call on the request path. */
  getSolUsd(): SolPrice {
    if (!this.last) {
      return { price: 0, stale: true, source: 'unavailable', ageMs: Infinity };
    }
    const ageMs = Date.now() - this.last.at;
    if (ageMs > MAX_AGE_MS) {
      return { price: 0, stale: true, source: 'expired', ageMs };
    }
    return {
      price: this.last.price,
      stale: ageMs > REFRESH_MS * 2,
      source: this.last.source,
      ageMs,
    };
  }

  /**
   * Races every source and takes the median of whatever answers, so one
   * mispriced or half-broken feed cannot move the number on its own.
   */
  private async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      const settled = await Promise.allSettled(this.sources.map((s) => s.fetch()));

      const quotes: { name: string; price: number }[] = [];
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled' && Number.isFinite(result.value) && result.value > 0) {
          quotes.push({ name: this.sources[i].name, price: result.value });
        }
      });

      if (quotes.length === 0) {
        this.logger.warn('No SOL price source responded — keeping the previous value');
        return;
      }

      quotes.sort((a, b) => a.price - b.price);
      const mid = Math.floor(quotes.length / 2);
      const median =
        quotes.length % 2 === 0 ? (quotes[mid - 1].price + quotes[mid].price) / 2 : quotes[mid].price;

      // A single source disagreeing by more than 5% with the median is a bad
      // feed, not a market move. Log it rather than letting it through quietly.
      for (const q of quotes) {
        if (Math.abs(q.price - median) / median > 0.05) {
          this.logger.warn(`${q.name} quoted $${q.price.toFixed(2)} vs median $${median.toFixed(2)}`);
        }
      }

      this.last = {
        price: median,
        at: Date.now(),
        source: quotes.length > 1 ? `median of ${quotes.length}` : quotes[0].name,
      };
    })().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }
}
