import { IsString, IsIn, IsOptional, MinLength } from 'class-validator';

export class SubmitTxDto {
  /** Base64 of the fully-signed transaction produced by the wallet. */
  @IsString()
  @MinLength(64)
  signedTransaction: string;

  @IsOptional()
  @IsIn(['buy', 'sell'])
  action?: 'buy' | 'sell';

  @IsOptional()
  @IsString()
  mint?: string;
}
