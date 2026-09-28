import { Controller, Get } from '@nestjs/common';
import { UpstreamService } from './common/upstream.service';
import { SolanaService } from './common/solana.service';

@Controller()
export class AppController {
  constructor(
    private readonly upstream: UpstreamService,
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
    const results = await Promise.allSettled([
      this.upstream.get('/coins', { limit: 1 }, 5000),
      this.solana.connection.getSlot(),
    ]);

    const pumpFun = results[0].status === 'fulfilled';
    const rpc = results[1].status === 'fulfilled';

    return {
      status: pumpFun && rpc ? 'ok' : 'degraded',
      dependencies: {
        pumpFun: pumpFun ? `ok (${this.upstream.activeHost})` : 'unreachable',
        solanaRpc: rpc ? 'ok' : 'unreachable',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
