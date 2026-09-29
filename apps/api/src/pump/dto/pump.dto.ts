import { IsString, IsNotEmpty, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class BuyTokenDto {
  @IsString()
  @IsNotEmpty()
  mintAddress: string;

  @IsNumber()
  @Min(0.000000001)
  amountSol: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  slippage?: number; // Slippage tolerance in basis points (e.g., 500 = 5%)
}

export class SellTokenDto {
  @IsString()
  @IsNotEmpty()
  mintAddress: string;

  @IsNumber()
  @Min(0.000000001)
  amountTokens: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  slippage?: number; // Slippage tolerance in basis points
}