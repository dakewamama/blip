// src/pump/pump.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SolanaService } from '../common/solana.service';
import { UpstreamService } from '../common/upstream.service';
import { PricesService } from '../common/prices.service';
import { normalizeToken } from '../common/normalize';
import { Quote, quoteBuy, quoteSell } from '../common/curve';
import { CreateTokenDto } from './dto/create-token.dto';
import { BuyTokenDto } from './dto/buy-token.dto';
import { SellTokenDto } from './dto/sell-token.dto';
import axios from 'axios';

export interface TokenResponse {
  success: boolean;
  signature?: string;
  error?: string;
  data?: any;
}

@Injectable()
export class PumpService {
  private readonly logger = new Logger(PumpService.name);
  
  // PumpPortal API for real trading
  private readonly PUMPPORTAL_BASE = 'https://pumpportal.fun/api';
  
  constructor(
    private readonly solana: SolanaService,
    private readonly upstream: UpstreamService,
    private readonly prices: PricesService,
  ) {}

  async createToken(createTokenDto: CreateTokenDto, imageFile?: any): Promise<TokenResponse> {
    try {
      this.logger.log('Creating token with real pump.fun API:', createTokenDto);
      
      // Note: Token creation requires connecting to pump.fun directly through their web interface
      // or using their smart contract. This is a complex operation that typically requires:
      // 1. Wallet connection
      // 2. Transaction signing
      // 3. Image upload to IPFS
      // 4. Metadata creation
      
      // For now, we'll prepare the transaction data that would be used
      const tokenData = {
        name: createTokenDto.name,
        symbol: createTokenDto.symbol,
        description: createTokenDto.description,
        website: createTokenDto.website,
        twitter: createTokenDto.twitter,
        telegram: createTokenDto.telegram,
      };

      if (imageFile) {
        this.logger.log('Image file received:', imageFile.originalname || 'unknown');
        // Handle image upload logic here when wallet integration is added
      }

      this.logger.log('Token creation prepared. Real implementation requires wallet integration.');
      
      // In a real implementation, you would:
      // 1. Upload image to IPFS
      // 2. Create metadata JSON
      // 3. Use Solana SDK to create the token
      // 4. Submit to pump.fun bonding curve
      
      return {
        success: false,
        error: 'Token creation requires wallet integration and frontend transaction signing. Use the pump.fun website directly.',
        data: tokenData
      };
    } catch (error) {
      this.logger.error('Failed to create token:', error);
      return {
        success: false,
        error: error.message || 'Token creation failed'
      };
    }
  }

  async buyToken(buyTokenDto: BuyTokenDto): Promise<TokenResponse> {
    try {
      this.logger.log('Initiating real token buy via PumpPortal:', buyTokenDto);
      
      // Check if wallet is connected
      if (!buyTokenDto.publicKey || buyTokenDto.publicKey === 'wallet_not_connected') {
        return {
          success: false,
          error: 'Wallet not connected. Please connect your wallet to trade tokens.'
        };
      }

      // Use PumpPortal for real trading
      const tradeData = {
        publicKey: buyTokenDto.publicKey,
        action: 'buy',
        mint: buyTokenDto.mint,
        denominatedInSol: true, // Amount is in SOL
        amount: buyTokenDto.solAmount, // Amount of SOL to spend
        slippage: buyTokenDto.slippage || 1, // 1% slippage
        priorityFee: buyTokenDto.priorityFee || 0.00001,
        pool: 'pump' // Trading on pump.fun
      };

      const response = await axios.post(`${this.PUMPPORTAL_BASE}/trade-local`, tradeData, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      if (response.data) {
        this.logger.log('Trade transaction prepared successfully');
        
        return {
          success: true,
          data: {
            transaction: response.data, // Serialized transaction to sign
            mint: buyTokenDto.mint,
            amount: buyTokenDto.amount,
            solAmount: buyTokenDto.solAmount,
            action: 'buy'
          }
        };
      } else {
        throw new Error('No transaction data received');
      }
    } catch (error) {
      this.logger.error('Failed to buy token:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Buy failed'
      };
    }
  }

  async sellToken(sellTokenDto: SellTokenDto): Promise<TokenResponse> {
    try {
      this.logger.log('Initiating real token sell via PumpPortal:', sellTokenDto);
      
      // Check if wallet is connected
      if (!sellTokenDto.publicKey || sellTokenDto.publicKey === 'wallet_not_connected') {
        return {
          success: false,
          error: 'Wallet not connected. Please connect your wallet to trade tokens.'
        };
      }
      
      const tradeData = {
        publicKey: sellTokenDto.publicKey,
        action: 'sell',
        mint: sellTokenDto.mint,
        denominatedInSol: false, // Amount is in tokens
        amount: sellTokenDto.amount, // Number of tokens to sell (or "100%" for all)
        slippage: sellTokenDto.slippage || 1,
        priorityFee: sellTokenDto.priorityFee || 0.00001,
        pool: 'pump'
      };

      const response = await axios.post(`${this.PUMPPORTAL_BASE}/trade-local`, tradeData, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      if (response.data) {
        this.logger.log('Sell transaction prepared successfully');
        
        return {
          success: true,
          data: {
            transaction: response.data, // Serialized transaction to sign
            mint: sellTokenDto.mint,
            amount: sellTokenDto.amount,
            action: 'sell'
          }
        };
      } else {
        throw new Error('No transaction data received');
      }
    } catch (error) {
      this.logger.error('Failed to sell token:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Sell failed'
      };
    }
  }

  async getTokenInfo(mintAddress: string): Promise<TokenResponse> {
    try {
      const raw = await this.upstream.get<any>(`/coins/${mintAddress}`);
      if (!raw?.mint) throw new NotFoundException('Token not found');
      return { success: true, data: raw };
    } catch (error: any) {
      this.logger.error(`Failed to get token info for ${mintAddress}: ${error.message}`);
      return { success: false, error: error.message || 'Failed to get token info' };
    }
  }

  /**
   * Quote a trade against the live bonding curve.
   *
   * Replaces the earlier spot-price calculation, which reported zero price
   * impact for any size and therefore quoted a large buy far too optimistically.
   */
  async getQuote(
    mint: string,
    amount: number,
    action: 'buy' | 'sell',
    slippageBps = 100,
  ): Promise<TokenResponse> {
    try {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('amount must be a positive number');
      }

      const raw = await this.upstream.get<any>(`/coins/${mint}`);
      if (!raw?.mint) throw new NotFoundException(`No pump.fun token for mint ${mint}`);

      const token = normalizeToken(raw);
      if (token.complete) {
        // Past graduation the bonding curve no longer prices the token.
        throw new BadRequestException(
          'Token has graduated to an AMM pool — route this trade through a DEX aggregator, not the curve',
        );
      }

      const reserves = {
        virtualSolReserves: token.virtualSolReserves,
        virtualTokenReserves: token.virtualTokenReserves,
        baseDecimals: token.baseDecimals,
      };

      const quote: Quote =
        action === 'buy'
          ? quoteBuy(reserves, amount, slippageBps)
          : quoteSell(reserves, amount, slippageBps);

      const solPrice = this.prices.getSolUsd();

      return {
        success: true,
        data: {
          mint,
          symbol: token.symbol,
          ...quote,
          solUsd: solPrice.price,
          valueUsd: (action === 'buy' ? quote.amountIn : quote.amountOut) * solPrice.price,
          // Anything above this and the user is eating the curve, not trading it.
          highImpact: quote.priceImpact > 0.05,
          computedAt: Date.now(),
        },
      };
    } catch (error: any) {
      this.logger.error(`Quote failed for ${mint}: ${error.message}`);
      return { success: false, error: error.message || 'Failed to get quote' };
    }
  }

  /**
   * Broadcast a transaction the user's wallet already signed, and wait for
   * confirmation. Without this the buy flow ended at "here is an unsigned
   * transaction" and nothing ever reported whether the trade landed.
   */
  async submitTransaction(signedTransaction: string, meta: { action?: string; mint?: string } = {}) {
    try {
      const { signature, slot } = await this.solana.submitSignedTransaction(signedTransaction);
      this.logger.log(`Confirmed ${meta.action ?? 'transaction'} ${signature}`);
      return {
        success: true,
        data: {
          signature,
          slot,
          status: 'confirmed',
          explorer: `https://solscan.io/tx/${signature}`,
          ...meta,
        },
      };
    } catch (error: any) {
      this.logger.error(`Transaction submission failed: ${error.message}`);
      return { success: false, error: error.message || 'Transaction failed' };
    }
  }

  async healthCheck() {
    const checks: Record<string, string> = {};

    try {
      await this.upstream.get('/coins', { limit: 1 }, 5000);
      checks.pumpFun = `connected (${this.upstream.activeHost})`;
    } catch {
      checks.pumpFun = 'unreachable';
    }

    try {
      await this.solana.connection.getSlot();
      checks.rpc = 'connected';
    } catch {
      checks.rpc = 'unreachable';
    }

    const price = this.prices.getSolUsd();
    checks.solPrice = price.price > 0 ? `$${price.price.toFixed(2)}${price.stale ? ' (stale)' : ''}` : 'unavailable';

    const healthy = checks.pumpFun.startsWith('connected') && checks.rpc === 'connected';

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'pump-service',
      checks,
    };
  }
}
