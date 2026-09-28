import { IsString, IsNumber, IsPositive, IsOptional } from 'class-validator';

export class SellTokenDto {
  @IsString()
  mint: string;

  @IsString()
  publicKey: string; // Wallet public key for signing

  @IsNumber()
  @IsPositive()
  amount: number; // Number of tokens to sell (or percentage like "100%")

  @IsOptional()
  @IsNumber()
  slippage?: number; // Slippage tolerance (default 1%)

  @IsOptional()
  @IsNumber()
  priorityFee?: number; // Priority fee (default 0.00001)
}