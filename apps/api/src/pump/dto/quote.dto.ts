import { IsIn, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteQueryDto {
  @IsIn(['buy', 'sell'])
  action: 'buy' | 'sell';

  /** SOL for a buy, tokens for a sell. */
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5000)
  slippageBps?: number;
}
