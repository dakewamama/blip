import { BadRequestException } from '@nestjs/common';

/** "1.5" with 9 decimals → 1500000000n. String maths, so no float rounding. */
export function toBaseUnits(decimal: string, decimals: number): bigint {
  const [whole, fraction = ''] = decimal.split('.');
  if (fraction.length > decimals) {
    throw new BadRequestException(`At most ${decimals} decimal places`);
  }
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

export function formatUnits(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const fraction = s.slice(s.length - decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
