import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';

// SolanaService is provided globally by CommonModule; no local provider needed.
@Module({
  controllers: [WalletController],
})
export class WalletModule {}
