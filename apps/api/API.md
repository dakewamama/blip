# trigger2nest — API

Base path is `/api`. `/health` sits outside the prefix for load balancers.

## What changed and why

Four bugs were found by reading the live upstream payload rather than the type definition:

| Bug | Effect | Fix |
| --- | --- | --- |
| `frontend-api.pump.fun` returns Cloudflare 1016 but was hardcoded as primary | ~8s wasted on every request before reaching a working mirror | `UpstreamService` leads with v3 and remembers the last host that worked |
| Payload sends `market_cap_usd`, code read `usd_market_cap` | Every market-cap sum and sort evaluated to 0 — `getMarketStats` always returned zero, search "sorted by market cap" did nothing | `normalizeToken()` accepts either spelling |
| `created_timestamp` is milliseconds, compared against a seconds cutoff | Every token counted as created in the last 24h | timestamps normalised to ms at the boundary |
| Wallet read only the legacy Token program | pump.fun mints under Token-2022 were invisible in balances | both programs queried and merged |
| Quote used spot price × amount | Zero price impact reported at any size; large buys quoted far too well | constant-product curve maths |
| Public RPC 429 triggered web3.js internal backoff | Feed request hung past 60s with no way to cancel | `disableRetryOnRateLimit` + abort-controller timeout + a 5s per-token scoring budget |

The `trading` module was removed: it returned hardcoded mock quotes and duplicated `pump` without adding anything.

## Endpoints

### Discovery

```
GET /api/feed?filter=trending|new|gainers|safest|featured&limit=25&offset=0&includeUnsafe=false
GET /api/feed/search?q=WIF&limit=20
GET /api/feed/:mint
```

`/api/feed` returns tokens already joined to their safety report and priced in USD. Tokens scoring below 40 are dropped and counted in `hiddenByFloor`. Search never applies the floor — asking for a token by name is consent. A full mint address in `q` resolves directly instead of scanning pages.

`/api/feed/:mint` returns `{ token, safety }` where `safety.checks` is the plain-English list.

### Safety

Scoring starts at 100 and subtracts for evidence:

| Signal | Penalty |
| --- | --- |
| Mint authority still live | −35 |
| Freeze authority still live | −30 |
| Top wallet > 25% | −30 |
| Real liquidity < 1 SOL | −25 |
| Top wallet 10–25% | −14 |
| Top 10 wallets > 60% | −12 |
| Liquidity 1–10 SOL | −12 |
| Age < 15 min | −12 |

`complete: false` means an RPC lookup timed out and the score leans on curve data alone. Surface that in the UI — do not present a partial score as a full one. On an un-graduated token the bonding curve is the largest account, so it is excluded before measuring wallet concentration.

### Trading

```
GET  /api/pump/quote/:mint?action=buy&amount=0.5&slippageBps=100
POST /api/pump/buy-token     -> unsigned transaction from PumpPortal
POST /api/pump/sell-token    -> unsigned transaction from PumpPortal
POST /api/pump/submit        -> { signedTransaction, action?, mint? }
```

Quote returns `amountOut`, `minAmountOut` (the slippage floor the frontend should enforce), `priceImpact`, `executionPrice` vs `spotPrice`, and `highImpact` when impact exceeds 5%. Graduated tokens are rejected with an explanation — the bonding curve no longer prices them and the trade belongs on a DEX aggregator.

`/submit` broadcasts a wallet-signed transaction, waits for confirmation, and returns the signature or the on-chain error. This closes the loop that previously ended at "here is an unsigned transaction".

### Portfolio

```
GET /api/portfolio/:address
```

Positions are valued at what the curve would actually pay to exit, not `amount × spot`. On thin liquidity those diverge badly, and `amount × spot` is the number that makes people think they are up. Both are returned (`exitValueUsd` vs `markValueUsd`) along with `priceImpactOnExit`. Token accounts that could not be priced are listed separately in `unpriced` rather than silently dropped.

### Health

```
GET /health      liveness, no external calls
GET /api/ready   readiness, actually reaches pump.fun and the RPC
```

## Notes

- SOL price never falls back to an invented number. If every source fails, `price: 0` and `solPriceStale: true` — render SOL amounts rather than a fictional dollar value.
- Throttled at 120 req/min per IP.
- `ValidationPipe` runs with `forbidNonWhitelisted`, so unknown body fields are a 400.
