import { Global, Module } from '@nestjs/common';
import { UpstreamService } from './upstream.service';
import { SolanaService } from './solana.service';
import { PricesService } from './prices.service';

@Global()
@Module({
  providers: [UpstreamService, SolanaService, PricesService],
  exports: [UpstreamService, SolanaService, PricesService],
})
export class CommonModule {}
