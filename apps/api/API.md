# blip API

Base path is `/api`. `/health` sits outside the prefix for load balancers.

One API serves every branded front end (blip, flick, kite). Each request names its brand in `x-blip-tenant`; unknown brands are a 400 and a missing header means `blip`. Market data is shared; custody is separate per brand.

## Where market data comes from

pump.fun's read API (`frontend-api*.pump.fun`) now answers servers with a Cloudflare bot challenge. That is a deliberate block, and this API does not try to get around it. Instead (`common/market.service.ts`):

| Data | Source |
| --- | --- |
| Which tokens exist: trending (24h volume), newest, search; names, art, launch time | GeckoTerminal's public API, `pump-fun` dex. Cached 60s and served stale if it rate-limits |
| Reserves, price, market cap, liquidity, graduation, creator | each token's bonding-curve account, read through `SOLANA_RPC_URL` in one batched call per list. Quotes read it fresh |
| Name and symbol of a mint discovery hasn't listed (e.g. in a wallet) | on-chain metadata: Token-2022 extension, or Metaplex |
| Price history | GeckoTerminal OHLCV, using the curve account as the pool id |

Only SOL-quoted curves are listed. pump.fun also runs curves quoted in other tokens, and blip's SOL quotes and trades can't price those. "Featured" (pump.fun's old king-of-the-hill) is the live curves nearest graduation. The legacy `/api/tokens/*` passthrough still calls pump.fun directly and is down with it.

## What changed and why

Four bugs were found by reading the live upstream payload rather than the type definition:

| Bug | Effect | Fix |
| --- | --- | --- |
| `frontend-api.pump.fun` returns Cloudflare 1016 but was hardcoded as primary | ~8s wasted on every request before reaching a working mirror | `UpstreamService` leads with v3 and remembers the last host that worked. Since superseded: every mirror is now bot-challenged, see above |
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

`buy-token` / `sell-token` return the PumpPortal transaction as base64. Before, they read PumpPortal's raw transaction bytes as text, which corrupted them, so nothing signed from those responses could ever have landed. `/submit` broadcasts a transaction a self-custody wallet signed, waits for confirmation, and returns the signature or the on-chain error. Custodial accounts don't use these routes; they trade through `/custody/trade`.

### Custody

```
GET  /api/custody/status            -> { tenant, custody, liveTrading, maxTradeUsd, feeReserveSol }
GET  /api/custody/account   (auth)  -> status + { address, portfolio }; creates the wallet on first call
POST /api/custody/trade     (auth)  { mint, action, amount, slippageBps?, maxUsd? }
POST /api/custody/withdraw  (auth)  { to, mint?, amount? | all: true }
```

"auth" is a Privy access token in `Authorization: Bearer …`. It is checked against the Privy app configured for the caller's brand (`PRIVY_APP_ID`, or `PRIVY_APP_ID_<BRAND>`).

- **Wallets.** Each user gets one Privy server wallet per brand. The wallet's write-once `external_id` (`<brand>-<privy user>`) is the only mapping, so there is no local table to lose. If `PRIVY_AUTHORIZATION_KEY` is set, new wallets are owned by that P-256 key and every signature needs it.
- **Trades.** Every number is worked out again on the server: the wallet balance, a fresh curve quote, the lower of the user's cap and `CUSTODY_MAX_TRADE_USD`, the 5% price-impact refusal, and a SOL reserve for fees. Then the PumpPortal transaction is decoded and checked before signing (`custody/tx-guard.ts`):
  - the custodial wallet pays the fee and is the only signer;
  - every program is on an allowlist;
  - the pump.fun instruction is the requested side on the requested mint, and a buy can't spend more than the amount plus slippage;
  - outbound SOL transfers and the priority fee are capped.
  
  Anything else is refused with a 502 and never signed. Trading needs `CUSTODY_LIVE_TRADING=true`; otherwise it is a 403.
- **Withdrawals.** SOL or any SPL / Token-2022 token, to any address. The recipient's token account is created if needed. "all" sends everything left after the network fee.
- **One at a time.** Only one transaction per wallet runs at once; a second is a 409.

### Funding (demo lane)

```
POST /api/funding/address         { owner }                        -> USDC deposit address + Solana Pay QR
POST /api/funding/build-transfer  { fromWallet, owner, amountUsdc } -> unsigned USDC transfer
GET  /api/funding/balance?owner=  -> credited USDC
GET  /api/funding/deposits?owner= -> credited deposits, newest first
```

This watches USDC arriving at a wallet the user owns and credits a ledger once a deposit reaches `SOLANA_COMMITMENT`. It is the demo build's funding route. Custodial accounts are funded by sending SOL straight to the held wallet. The ledger lives in `FUNDING_STORE_DIR` on local disk.

### Portfolio

```
GET /api/portfolio/:address
```

Positions are valued at what the curve would actually pay to exit, not `amount × spot`. On thin liquidity those diverge badly, and `amount × spot` is the number that makes people think they are up. Both are returned (`exitValueUsd` vs `markValueUsd`) along with `priceImpactOnExit`. Token accounts that could not be priced are listed separately in `unpriced` rather than silently dropped.

### Health

```
GET /health      liveness, no external calls
GET /api/ready   readiness: market data (GeckoTerminal + chain) and the RPC
```

## Notes

- SOL price never falls back to an invented number. If every source fails, `price: 0` and `solPriceStale: true` — render SOL amounts rather than a fictional dollar value.
- Throttled at 120 req/min per IP.
- `ValidationPipe` runs with `forbidNonWhitelisted`, so unknown body fields are a 400.
- GeckoTerminal's free tier allows a few dozen calls a minute per server. Lists cost at most 3 calls a minute, a token page 1–2. The caches above keep normal traffic well inside that, even with all three front ends sharing the API.
- Tests: `npm test` covers the transaction guard, tenant resolution, custody config, amount maths, and the curve, metadata and GeckoTerminal decoders. There is also a `/health` e2e test. Signing and broadcasting against Privy and mainnet are not covered by automated tests.
