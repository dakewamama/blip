import { BadRequestException, Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PumpService } from './pump.service';
import { CreateTokenDto } from './dto/create-token.dto';
import { SubmitTxDto } from './dto/submit-tx.dto';
import { BuyTokenDto } from './dto/buy-token.dto';
import { SellTokenDto } from './dto/sell-token.dto';

@Controller('pump')
export class PumpController {
  constructor(private readonly pumpService: PumpService) {}

  @Post('create-token')
  @UseInterceptors(FileInterceptor('image'))
  async createToken(
    @Body() createTokenDto: CreateTokenDto,
    @UploadedFile() file?: any,
  ) {
    return this.pumpService.createToken(createTokenDto, file);
  }

  @Get('health')
  async healthCheck() {
    return this.pumpService.healthCheck();
  }

  @Post('buy-token')
  async buyToken(@Body() buyTokenDto: BuyTokenDto) {
    return this.pumpService.buyToken(buyTokenDto);
  }

  @Post('sell-token')
  async sellToken(@Body() sellTokenDto: SellTokenDto) {
    return this.pumpService.sellToken(sellTokenDto);
  }

  @Get('token-info/:mintAddress')
  async getTokenInfo(@Param('mintAddress') mintAddress: string) {
    return this.pumpService.getTokenInfo(mintAddress);
  }

  @Get('quote/:mint')
  async getQuote(
    @Param('mint') mint: string,
    @Query('amount') amount: string,
    @Query('action') action: 'buy' | 'sell',
    @Query('slippageBps') slippageBps?: string,
  ) {
    if (action !== 'buy' && action !== 'sell') {
      throw new BadRequestException("action must be 'buy' or 'sell'");
    }
    return this.pumpService.getQuote(
      mint,
      Number(amount),
      action,
      slippageBps ? Number(slippageBps) : 100,
    );
  }

  /** Relay a wallet-signed transaction and confirm it on-chain. */
  @Post('submit')
  async submitTransaction(@Body() dto: SubmitTxDto) {
    return this.pumpService.submitTransaction(dto.signedTransaction, {
      action: dto.action,
      mint: dto.mint,
    });
  }
}
