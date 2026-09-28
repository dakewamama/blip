import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { FundingService } from './funding.service';
import { AddressDto, BuildTransferDto } from './dto/funding.dto';

/**
 * Crypto-funding HTTP surface, mirroring dakewamama/onboarding's /funding/* routes
 * under blip's global 'api' prefix:
 *
 *   POST /api/funding/address        { owner }                        -> address + QR, arms watch
 *   POST /api/funding/build-transfer { fromWallet, owner, amountUsdc } -> unsigned tx (base64)
 *   GET  /api/funding/balance        ?owner=                          -> durably-credited balance
 *   GET  /api/funding/deposits       ?owner=                          -> credited deposit history
 */
@Controller('funding')
export class FundingController {
  constructor(private readonly funding: FundingService) {}

  @Post('address')
  address(@Body() dto: AddressDto) {
    return this.funding.issueDepositAddress(dto.owner);
  }

  @Post('build-transfer')
  buildTransfer(@Body() dto: BuildTransferDto) {
    return this.funding.buildTransfer(dto.fromWallet, dto.owner, dto.amountUsdc);
  }

  @Get('balance')
  balance(@Query('owner') owner?: string) {
    if (!owner) throw new BadRequestException('owner is required');
    return this.funding.balance(owner);
  }

  @Get('deposits')
  deposits(@Query('owner') owner?: string) {
    if (!owner) throw new BadRequestException('owner is required');
    return { owner, deposits: this.funding.deposits(owner) };
  }
}
