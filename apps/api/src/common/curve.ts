/**
 * pump.fun bonding curve maths.
 *
 * The previous quote implementation used spot price (sol_reserves / token_reserves)
 * and multiplied. That is only correct for an infinitesimal trade — it reports no
 * price impact at all, so a buy large enough to move the curve would quote high
 * and fill low. This uses the actual constant-product invariant the curve enforces.
 *
 *   k = x * y            x = virtual SOL reserves, y = virtual token reserves
 *   buy:  dy = y - k / (x + dx_after_fee)
 *   sell: dx = x - k / (y + dy)
 */

const LAMPORTS = 1_000_000_000;
/** pump.fun takes 1% of the SOL leg on both sides. */
export const PUMP_FEE_BPS = 100;

export interface CurveReserves {
  virtualSolReserves: number; // lamports
  virtualTokenReserves: number; // base units
  baseDecimals: number;
}

export interface Quote {
  action: 'buy' | 'sell';
  /** What the user puts in, in human units (SOL for buy, tokens for sell). */
  amountIn: number;
  /** What they get out, in human units (tokens for buy, SOL for sell). */
  amountOut: number;
  /** Worst acceptable output after slippage — what the frontend should enforce. */
  minAmountOut: number;
  /** SOL per token before the trade. */
  spotPrice: number;
  /** SOL per token actually paid across the trade. */
  executionPrice: number;
  /** Fraction, e.g. 0.023 = 2.3%. */
  priceImpact: number;
  feeSol: number;
  slippageBps: number;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

export function quoteBuy(
  reserves: CurveReserves,
  solIn: number,
  slippageBps = 100,
): Quote {
  assertPositive(solIn, 'solAmount');
  const { virtualSolReserves: x, virtualTokenReserves: y, baseDecimals } = reserves;
  assertPositive(x, 'virtual SOL reserves');
  assertPositive(y, 'virtual token reserves');

  const scale = 10 ** baseDecimals;
  const dxGross = solIn * LAMPORTS;
  const feeLamports = (dxGross * PUMP_FEE_BPS) / 10_000;
  const dx = dxGross - feeLamports;

  const k = x * y;
  const tokensOut = y - k / (x + dx);

  const spotPrice = x / LAMPORTS / (y / scale);
  const outHuman = tokensOut / scale;
  const executionPrice = outHuman > 0 ? solIn / outHuman : 0;

  return {
    action: 'buy',
    amountIn: solIn,
    amountOut: outHuman,
    minAmountOut: outHuman * (1 - slippageBps / 10_000),
    spotPrice,
    executionPrice,
    priceImpact: spotPrice > 0 ? Math.max(0, executionPrice / spotPrice - 1) : 0,
    feeSol: feeLamports / LAMPORTS,
    slippageBps,
  };
}

export function quoteSell(
  reserves: CurveReserves,
  tokensIn: number,
  slippageBps = 100,
): Quote {
  assertPositive(tokensIn, 'tokenAmount');
  const { virtualSolReserves: x, virtualTokenReserves: y, baseDecimals } = reserves;
  assertPositive(x, 'virtual SOL reserves');
  assertPositive(y, 'virtual token reserves');

  const scale = 10 ** baseDecimals;
  const dy = tokensIn * scale;

  const k = x * y;
  const solOutGross = x - k / (y + dy);
  const feeLamports = (solOutGross * PUMP_FEE_BPS) / 10_000;
  const solOut = solOutGross - feeLamports;

  const spotPrice = x / LAMPORTS / (y / scale);
  const outHuman = solOut / LAMPORTS;
  const executionPrice = tokensIn > 0 ? outHuman / tokensIn : 0;

  return {
    action: 'sell',
    amountIn: tokensIn,
    amountOut: outHuman,
    minAmountOut: outHuman * (1 - slippageBps / 10_000),
    spotPrice,
    executionPrice,
    // Selling executes below spot, so impact is the shortfall.
    priceImpact: spotPrice > 0 ? Math.max(0, 1 - executionPrice / spotPrice) : 0,
    feeSol: feeLamports / LAMPORTS,
    slippageBps,
  };
}

/** How far along the bonding curve the token is, 0..1. Graduation is at ~85 SOL real reserves. */
export const GRADUATION_SOL = 85;

export function curveProgress(realSolReserves: number): number {
  return Math.min(1, realSolReserves / LAMPORTS / GRADUATION_SOL);
}
