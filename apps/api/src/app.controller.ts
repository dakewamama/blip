import { Controller, Get } from '@nestjs/common';
import { MarketService } from './common/market.service';
import { SolanaService } from './common/solana.service';

@Controller()
export class AppController {
  constructor(
    private readonly market: MarketService,
    private readonly solana: SolanaService,
  ) {}

  /** Liveness — no external calls, safe for a load balancer to hammer. */
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Readiness — actually reaches the dependencies. */
  @Get('ready')
  async ready() {
    const [market, slot] = await Promise.allSettled([this.market.healthy(), this.solana.connection.getSlot()]);

    const marketData = market.status === 'fulfilled' && market.value;
    const rpc = slot.status === 'fulfilled';

    return {
      status: marketData && rpc ? 'ok' : 'degraded',
      dependencies: {
        marketData: marketData ? 'ok (geckoterminal + chain)' : 'unreachable',
        solanaRpc: rpc ? 'ok' : 'unreachable',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
