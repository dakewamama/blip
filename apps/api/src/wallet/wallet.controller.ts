import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { SolanaService } from '../common/solana.service';

/**
 * Read-only wallet lookups.
 *
 * The controller path is 'wallet', not 'api/wallet': a global 'api' prefix is
 * already applied in main.ts, and repeating it here produced an unreachable
 * '/api/api/wallet' route.
 *
 * It delegates to the shared SolanaService rather than opening its own RPC
 * connection, so it inherits the same fixes the rest of the app relies on:
 * both the legacy Token program and Token-2022 are read (pump.fun mints under
 * both), rate-limit retries are disabled, and every call is time-bounded.
 */
@Controller('wallet')
export class WalletController {
  constructor(private readonly solana: SolanaService) {}

  @Get(':address/balance')
  async getBalance(@Param('address') address: string) {
    if (!this.solana.isValidAddress(address)) {
      throw new BadRequestException(`${address} is not a valid Solana address`);
    }
    const balance = await this.solana.getSolBalance(address);
    return { address, balance };
  }

  @Get(':address/tokens')
  async getTokens(@Param('address') address: string) {
    if (!this.solana.isValidAddress(address)) {
      throw new BadRequestException(`${address} is not a valid Solana address`);
    }
    const accounts = await this.solana.getTokenAccounts(address);
    return { address, accounts };
  }
}
