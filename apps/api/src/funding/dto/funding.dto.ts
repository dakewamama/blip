import { IsString, IsNotEmpty, Matches } from 'class-validator';

const DECIMAL = /^\d+(\.\d+)?$/;

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  owner: string;
}

export class BuildTransferDto {
  @IsString()
  @IsNotEmpty()
  fromWallet: string;

  @IsString()
  @IsNotEmpty()
  owner: string;

  /** Decimal USDC string, e.g. "25" or "33.11". Base units are derived server-side. */
  @IsString()
  @Matches(DECIMAL, { message: 'amountUsdc must be a decimal amount like "25" or "33.11"' })
  amountUsdc: string;
}
