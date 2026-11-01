import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SolanaService } from '../common/solana.service';
import { PricesService } from '../common/prices.service';
import { MarketService } from '../common/market.service';
import { quoteSell } from '../common/curve';

export interface PortfolioPosition {
  mint: string;
  name: string;
  symbol: string;
  imageUri?: string;
  amount: number;
  priceSol: number;
  /** What the position is actually worth if sold now, curve impact included. */
  exitValueSol: number;
  exitValueUsd: number;
  /** Naive mark at spot, for comparison against the realistic exit. */
  markValueUsd: number;
  priceImpactOnExit: number;
  graduated: boolean;
}

export interface Portfolio {
  address: string;
  solBalance: number;
  solUsd: number;
  solPriceStale: boolean;
  cashUsd: number;
  positionsUsd: number;
  totalUsd: number;
  positions: PortfolioPosition[];
  /** Token accounts we could not price (not pump.fun tokens, or upstream miss). */
  unpriced: { mint: string; amount: number }[];
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly solana: SolanaService,
    private readonly prices: PricesService,
    private readonly market: MarketService,
  ) {}

  async getPortfolio(address: string): Promise<Portfolio> {
    if (!this.solana.isValidAddress(address)) {
      throw new BadRequestException(`${address} is not a valid Solana address`);
    }

    const [solBalance, accounts, solPrice] = await Promise.all([
      this.solana.getSolBalance(address),
      this.solana.getTokenAccounts(address),
      Promise.resolve(this.prices.getSolUsd()),
    ]);

    const positions: PortfolioPosition[] = [];
    const unpriced: { mint: string; amount: number }[] = [];

    // One batched curve read for the whole wallet, however many accounts it has.
    const tokens = await this.market.tokens(accounts.map((a) => a.mint)).catch(() => new Map());

    for (const account of accounts) {
      try {
        const token = tokens.get(account.mint);
        if (!token) {
          unpriced.push({ mint: account.mint, amount: account.amount });
          continue;
        }

        // Value the position by what the curve would actually pay for it,
        // not by amount × spot — those diverge badly on thin liquidity.
        let exitValueSol = account.amount * token.priceSol;
        let priceImpact = 0;
        try {
          const quote = quoteSell(
            {
              virtualSolReserves: token.virtualSolReserves,
              virtualTokenReserves: token.virtualTokenReserves,
              baseDecimals: token.baseDecimals,
            },
            account.amount,
          );
          exitValueSol = quote.amountOut;
          priceImpact = quote.priceImpact;
        } catch {
          // Curve data missing (usually a graduated token) — spot mark stands.
        }

        positions.push({
          mint: token.mint,
          name: token.name,
          symbol: token.symbol,
          imageUri: token.imageUri,
          amount: account.amount,
          priceSol: token.priceSol,
          exitValueSol,
          exitValueUsd: exitValueSol * solPrice.price,
          markValueUsd: account.amount * token.priceSol * solPrice.price,
          priceImpactOnExit: priceImpact,
          graduated: token.complete,
        });
      } catch {
        unpriced.push({ mint: account.mint, amount: account.amount });
      }
    }

    positions.sort((a, b) => b.exitValueUsd - a.exitValueUsd);

    const cashUsd = solBalance * solPrice.price;
    const positionsUsd = positions.reduce((a, p) => a + p.exitValueUsd, 0);

    return {
      address,
      solBalance,
      solUsd: solPrice.price,
      solPriceStale: solPrice.stale,
      cashUsd,
      positionsUsd,
      totalUsd: cashUsd + positionsUsd,
      positions,
      unpriced,
    };
  }
}
