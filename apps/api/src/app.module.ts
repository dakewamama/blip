import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MulterModule } from '@nestjs/platform-express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { SafetyModule } from './safety/safety.module';
import { FeedModule } from './feed/feed.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { TokensModule } from './tokens/tokens.module';
import { WalletModule } from './wallet/wallet.module';
import { PumpModule } from './pump/pump.module';
import { FundingModule } from './funding/funding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // The upstream APIs are rate-limited and the RPC costs money per call;
    // this keeps one noisy client from exhausting either.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    MulterModule.register({ dest: './uploads', limits: { fileSize: 5 * 1024 * 1024 } }),
    CommonModule,
    SafetyModule,
    FeedModule,      // discover list + token detail, safety-scored
    PortfolioModule, // wallet holdings valued at realistic exit
    PumpModule,      // quotes, trade construction, transaction submission
    FundingModule,   // USDC-on-Solana deposit addresses + on-chain credit watcher
    TokensModule,    // raw pump.fun passthrough (legacy surface)
    WalletModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
