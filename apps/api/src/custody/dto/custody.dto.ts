import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, Min } from 'class-validator';

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL = /^\d+(\.\d+)?$/;

export class TradeDto {
  @IsString()
  @Matches(BASE58_ADDRESS, { message: 'mint must be a Solana address' })
  mint: string;

  @IsIn(['buy', 'sell'])
  action: 'buy' | 'sell';

  /** SOL to spend on a buy; tokens to sell on a sell. */
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  slippageBps?: number;

  /** The user's own per-trade cap in USD. The server applies the lower of this and its own limit. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxUsd?: number;
}

export class WithdrawDto {
  @IsString()
  @Matches(BASE58_ADDRESS, { message: 'to must be a Solana address' })
  to: string;

  /** A token mint, or omitted for SOL. */
  @IsOptional()
  @IsString()
  @Matches(BASE58_ADDRESS, { message: 'mint must be a Solana address' })
  mint?: string;

  /** Decimal amount in human units, e.g. "0.25". Ignored when `all` is set. */
  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: 'amount must be a decimal like "0.25"' })
  amount?: string;

  /** Withdraw the whole balance (for SOL: everything left after the network fee). */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
