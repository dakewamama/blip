import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { TENANT_HEADER, resolveTenant } from '../common/tenant';
import { CustodyService } from './custody.service';
import { Caller, CustodyAuthGuard, CustodyCaller } from './custody.guard';
import { TradeDto, WithdrawDto } from './dto/custody.dto';

/**
 *   GET  /api/custody/status             public — is custody / live trading on for this tenant
 *   GET  /api/custody/account   (auth)   the caller's wallet address + holdings, created on first call
 *   POST /api/custody/trade     (auth)   { mint, action, amount, slippageBps?, maxUsd? } → signed, confirmed
 *   POST /api/custody/withdraw  (auth)   { to, mint?, amount? | all } → signed, confirmed
 *
 * "auth" is a Privy access token in `Authorization: Bearer …`, verified against
 * the Privy app of the tenant named in `x-blip-tenant`.
 */
@Controller('custody')
export class CustodyController {
  constructor(private readonly custody: CustodyService) {}

  @Get('status')
  status(@Headers(TENANT_HEADER) tenant?: string) {
    return this.custody.status(resolveTenant(tenant));
  }

  @Get('account')
  @UseGuards(CustodyAuthGuard)
  account(@Caller() caller: CustodyCaller) {
    return this.custody.account(caller);
  }

  @Post('trade')
  @UseGuards(CustodyAuthGuard)
  trade(@Caller() caller: CustodyCaller, @Body() dto: TradeDto) {
    return this.custody.trade(caller, dto);
  }

  @Post('withdraw')
  @UseGuards(CustodyAuthGuard)
  withdraw(@Caller() caller: CustodyCaller, @Body() dto: WithdrawDto) {
    return this.custody.withdraw(caller, dto);
  }
}
