import { Module } from '@nestjs/common';
import { PumpController } from './pump.controller';
import { PumpService } from './pump.service';

@Module({
  controllers: [PumpController],
  providers: [PumpService],
  exports: [PumpService],
})
export class PumpModule {}
