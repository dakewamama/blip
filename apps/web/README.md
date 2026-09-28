# blip — Next.js frontend

Trading front end for the `triggger2nest` backend. Next.js 15 (App Router), React 19, TypeScript strict.

## Run

```bash
npm install
cp .env.example .env.local     # point NEXT_PUBLIC_API_BASE at the backend
npm run dev                    # http://localhost:3000
```

The backend must be running (`npm run start:dev` in `triggger2nest-backend`, default `http://localhost:8000/api`).

## What is real and what is not

**Real, from the chain:** the token feed, safety scores, SOL price, market caps, liquidity, bonding-curve quotes (fee, price impact, slippage floor), price history, and the read-only wallet view on the portfolio page.

**Simulated:** order settlement. Buys and sells are *priced* by a live backend quote — the fill you get reflects real fees and real curve impact — but nothing is signed or broadcast. `POST /api/pump/submit` on the backend is ready for a wallet adapter; wiring one is the remaining step to real execution.

Nothing is faked to fill a gap. When the backend is unreachable the app says so (`components/BackendDown.tsx`) instead of falling back to sample tokens. When a safety score is partial because an RPC lookup timed out, the score carries an asterisk and the detail page explains it. When the SOL price is stale or missing, dollar values are labelled or withheld.

The previous version drew charts from a seeded random walk. That generator is gone. Charts now render real OHLCV, or an explicit "no history" state.

## Routes

| Route | Rendering | Data |
| --- | --- | --- |
| `/` | static, revalidate 30s | live top-of-feed token and ticker; sections disappear if the backend is down |
| `/auth` | static + client | local onboarding, 4 steps |
| `/app/discover` | dynamic SSR | `GET /feed` — first paint already has real prices |
| `/app/token/[mint]` | dynamic SSR | `GET /feed/:mint` + `/history`, live debounced quotes on the client |
| `/app/portfolio` | client | paper book marked by live sell quotes, plus optional real wallet tracking |
| `/app/activity` | client | local ledger |
| `/app/coaching` | client | product catalogue, local |

## Architecture

- `lib/api.ts` — the only place that talks to the backend. Typed, throws `ApiError`, sets `no-store` or an explicit `revalidate` per call because markets are not cacheable by default.
- `lib/store.tsx` — `useReducer` in the root layout so state survives client navigation; persisted to `localStorage` under `blip:state:v2`. `buy`/`sell` are async: they fetch a quote, refuse trades above 5% price impact, and then book the fill.
- `lib/data.ts` — what remains after the fixtures were deleted: the coaching catalogue and the presentation rules for a score.
- `lib/format.ts` — display formatting plus `polyline`, which draws real series only.

## Notes

- Positions are marked at **exit value**, not `amount × spot`. On thin liquidity those diverge badly, and `amount × spot` is the number that makes people think they are up. Both are available; the portfolio shows the honest one and reports exit impact next to it.
- Per-trade cap is enforced on every buy path, including quick-buy from the feed.
- Graduated tokens disable the buy button — the bonding curve no longer prices them.
