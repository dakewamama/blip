import { Global, Module } from '@nestjs/common';
import { UpstreamService } from './upstream.service';
import { SolanaService } from './solana.service';
import { PricesService } from './prices.service';
import { MarketService } from './market.service';

@Global()
@Module({
  providers: [UpstreamService, SolanaService, PricesService, MarketService],
  exports: [UpstreamService, SolanaService, PricesService, MarketService],
})
export class CommonModule {}
