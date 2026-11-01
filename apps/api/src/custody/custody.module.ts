import { Module } from '@nestjs/common';
import { PumpModule } from '../pump/pump.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { CustodyController } from './custody.controller';
import { CustodyService } from './custody.service';
import { CustodyAuthGuard } from './custody.guard';
import { PrivyService } from './privy.service';

@Module({
  imports: [PumpModule, PortfolioModule],
  controllers: [CustodyController],
  providers: [PrivyService, CustodyService, CustodyAuthGuard],
})
export class CustodyModule {}
