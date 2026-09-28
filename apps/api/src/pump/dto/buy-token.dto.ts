import { IsString, IsNumber, IsPositive, IsOptional } from 'class-validator';

export class BuyTokenDto {
  @IsString()
  mint: string;

  @IsString()
  publicKey: string; // Wallet public key for signing

  @IsNumber()
  @IsPositive()
  amount: number; // Number of tokens to buy

  @IsNumber()
  @IsPositive()
  solAmount: number; // Amount of SOL to spend

  @IsOptional()
  @IsNumber()
  slippage?: number; // Slippage tolerance (default 1%)

  @IsOptional()
  @IsNumber()
  priorityFee?: number; // Priority fee (default 0.00001)
}