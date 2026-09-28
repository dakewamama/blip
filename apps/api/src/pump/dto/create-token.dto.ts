import { IsString, IsOptional, IsUrl } from 'class-validator';

export class CreateTokenDto {
  @IsString()
  name: string;

  @IsString()
  symbol: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsUrl()
  twitter?: string;

  @IsOptional()
  @IsUrl()
  telegram?: string;
}