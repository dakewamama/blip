# blip — Next.js frontend

Trading front end for the blip API (`apps/api`). Next.js 15 (App Router), React 19, TypeScript strict.

## Run

From the repo root:

```bash
npm install
npm run setup     # writes .env.local from .env.example; API_ORIGIN points at the API
npm run dev       # API on :8000, blip :3000, flick :3001, kite :3002
```

`npm run dev:blip` (or `dev:flick`, `dev:kite`) runs a single front end; the API must be running too (`npm run dev:api`).

## Brands

The same app ships as `blip`, `flick` and `kite`. `NEXT_PUBLIC_BRAND` picks one (unknown or empty means `blip`), and `lib/brand.ts` holds everything that differs: name, tagline, description and accent colours. It is inlined at build time, so restart or rebuild after changing it. To run several brands from one checkout against one backend, each instance needs its own build directory and port. `scripts/web.mjs` at the repo root does that, and the root `dev` / `build` / `start` scripts use it.

Every request carries `x-blip-tenant: <brand>`, so the API keeps each brand's custodial wallets, Privy app and limits apart while sharing market data.

- The accent is `--lime`, `--lime-ink` and `--lime-soft`, set on `<html>` by `app/layout.tsx`. `globals.css` derives `--lime-hi`, `--lime-wash`, `--lime-line` and `--lime-glow` from `--lime`. Use these tokens instead of literal colours so every brand picks them up.
- Page titles are bare (`"coaching"`); the root layout's title template adds the brand name.
- The first time Next sees a new build directory it appends `<dir>/types/**/*.ts` to `tsconfig.json`'s `include`; `.gitignore` covers `.next-*`.

## What is real and what is not

**Always real, from the chain:** the token feed, safety scores, SOL price, market caps, liquidity, bonding-curve quotes (fee, price impact, slippage floor), price history, and the read-only wallet tracking on the portfolio page.

**Custodial build** (`NEXT_PUBLIC_PRIVY_APP_ID` set, matching the API's Privy app): sign-in is a real Privy email or Google/Apple login. The API holds one Solana wallet per user per brand (`lib/custody.tsx`). Cash and positions are that wallet's on-chain balances, deposits are SOL sent to its address, and withdrawals of SOL or any token go out from the wallet page. Buys and sells are signed and broadcast by the API, but only when the API has `CUSTODY_LIVE_TRADING=true`. Without that switch the wallet works but trading is refused with a clear message.

**Demo build** (no Privy app ID): the same screens over a simulated balance that lives on the device. Fills are priced by live quotes but not signed, and every screen says it is a demo. The card checkout, sample referrals and coaching payments only exist here.

Nothing is faked to fill a gap. When the backend is unreachable the app says so (`components/BackendDown.tsx`) instead of falling back to sample tokens. When a safety score is partial because an RPC lookup timed out, the score carries an asterisk and the detail page explains it. When the SOL price is stale or missing, dollar values are labelled or withheld.

The previous version drew charts from a seeded random walk. That generator is gone. Charts now render real OHLCV, or an explicit "no history" state.

## Routes

| Route | Rendering | Data |
| --- | --- | --- |
| `/` | static, revalidate 30s | live top-of-feed token and ticker; sections disappear if the backend is down |
| `/auth` | static + client | Privy email/OAuth login + guardrails (demo: any code works) |
| `/app/wallet` | client | custodial: deposit address, balance, withdrawals · demo: USDC watch on your own wallet |
| `/app/discover` | dynamic SSR | `GET /feed` — first paint already has real prices |
| `/app/token/[mint]` | dynamic SSR | `GET /feed/:mint` + `/history`, live debounced quotes on the client |
| `/app/portfolio` | client | held wallet's positions (demo: paper book), marked live, plus read-only tracking of any wallet |
| `/app/activity` | client | local ledger |
| `/app/coaching` | client | product catalogue, local |

## Architecture

- `lib/api.ts` — the only place that talks to the backend. Typed, throws `ApiError`, sets `no-store` or an explicit `revalidate` per call because markets are not cacheable by default.
- `lib/custody.tsx` — Privy provider and the held-wallet session: account, trade, withdraw, sign-in. A no-op demo implementation stands in when no app ID is set.
- `lib/store.tsx` — `useReducer` in the root layout so state survives client navigation; persisted to `localStorage` under `blip:state:v2`. `buy`/`sell` are async: they fetch a quote, refuse trades above 5% price impact, and then either send the trade to the API (custodial) or book a paper fill (demo). In custodial builds cash and holdings come from the chain; local state only keeps cost basis.
- `lib/data.ts` — what remains after the fixtures were deleted: the coaching catalogue and the presentation rules for a score.
- `lib/format.ts` — display formatting plus `polyline`, which draws real series only.

## Notes

- Positions are marked at **exit value**, not `amount × spot`. On thin liquidity those diverge badly, and `amount × spot` is the number that makes people think they are up. Both are available; the portfolio shows the honest one and reports exit impact next to it.
- Per-trade cap is enforced on every buy path, including quick-buy from the feed.
- Graduated tokens disable the buy button — the bonding curve no longer prices them.
