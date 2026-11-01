# blip

Memecoin trading on Solana. One NestJS API serves three branded Next.js front ends: **blip**, **flick** and **kite**. They share one codebase in `apps/web` and are told apart by `NEXT_PUBLIC_BRAND`. The app is **custodial**: it holds a Solana wallet for each user through Privy server wallets.

```
blip/
├─ apps/web    Next.js 15 · App Router · React 19 — one codebase, three brands
├─ apps/api    NestJS 10 · pump.fun + Solana RPC + Privy custody
└─ scripts/    env setup, per-brand launcher
```

## Run it

```bash
npm install
npm run setup     # writes apps/api/.env and apps/web/.env.local from the examples
npm run dev       # api :8000 · blip :3000 · flick :3001 · kite :3002
```

One command starts all four processes, with output prefixed `api` / `blip` / `flick` / `kite`. `npm run dev:api` and `npm run dev:blip` (or `dev:flick`, `dev:kite`) run them one at a time.

Production: `npm run build`, then `npm start`. Other scripts: `npm test` (API unit tests) and `npm run typecheck` (both apps).

## Brands

`apps/web/lib/brand.ts` holds everything that differs per brand: name, copy, accent colours and support channels. Each front end sends `x-blip-tenant: <brand>` on every API call. Market data is shared, while custody is separate per brand: a user's wallet under flick is not their wallet under kite. To add a brand, add it to `BRANDS`, add it to the API's `TENANTS`, and run another instance.

## Custody

With `PRIVY_APP_ID` / `PRIVY_APP_SECRET` set on the API and `NEXT_PUBLIC_PRIVY_APP_ID` on the front end, sign-in is a real Privy login. The API then creates and holds one Solana wallet per user per brand:

- Balances are that wallet's on-chain holdings.
- Users fund it by sending SOL to its address, and withdraw SOL or any token to an address they choose.
- Trades are signed server-side only after the PumpPortal transaction is decoded and checked against the request (`apps/api/src/custody/tx-guard.ts`), and only when `CUSTODY_LIVE_TRADING=true`.

Without the Privy keys every front end runs as a **demo build**. The screens are the same, the balance is simulated on the device, and each screen says it is a demo. Holding user funds can bring licensing and KYC/AML obligations depending on where your users are, so check that before switching live trading on.

## About CORS

There is no CORS problem to hit, because in normal use there is no cross-origin request.

The browser only ever calls **same-origin `/api/...`**. `apps/web/next.config.mjs` rewrites that to the Nest server, so the request leaves Next server-to-server. No preflight, no `Access-Control-*` negotiation, nothing to misconfigure. In production it also means the API never has to be publicly reachable — put only the web app on the internet.

`lib/api.ts` picks its base accordingly: `/api` in the browser, and `API_ORIGIN` directly on the server. Proxying a server-side render through your own public URL would be a pointless extra hop, and inside a container the public hostname often will not resolve.

CORS is still configured on the API, for the cases where something calls it directly — a mobile client, a second front end, curl:

- Requests **without** an `Origin` header are allowed. That covers the proxy, SSR, curl and health probes.
- In development, any `localhost` / `127.0.0.1` port is allowed.
- In production, only origins listed in `CORS_ORIGIN` (comma-separated) are allowed; `NODE_ENV=production` disables the localhost convenience.
- A disallowed origin gets a response with no `Access-Control-Allow-Origin` header rather than a thrown 500 — a 500 on a preflight is much harder to diagnose than a missing header.

Verified:

| Request | Result |
| --- | --- |
| `GET localhost:3000/api/ready` | 200 through the proxy |
| `OPTIONS` preflight via proxy | 204, `allow-origin: http://localhost:3000` |
| Direct to `:8000` with `Origin: localhost:3000` (dev) | 200 with CORS headers |
| Direct to `:8000` with `Origin: https://evil.example` | no CORS headers — browser blocks it |

## Configuration

`apps/api/.env`

| Variable | Notes |
| --- | --- |
| `PORT`, `HOST` | defaults 8000 / 0.0.0.0 |
| `CORS_ORIGIN` | only for direct browser callers; usually empty |
| `SOLANA_RPC_URL` | **use a private endpoint.** Prices are read from the chain now, so this carries the feed too. The public endpoint rate-limits within a few requests: safety scores come back `complete: false`, and under load a list can briefly fail to price |
| `PUMP_API_BASES` | pump.fun mirrors for the legacy `/api/tokens` passthrough only. The feed no longer uses pump.fun's API |
| `TENANTS` | brands served, default `blip`; e.g. `blip,flick,kite` |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | turn custody on. Per-brand override: `PRIVY_APP_ID_FLICK` etc. |
| `PRIVY_AUTHORIZATION_KEY` | optional P-256 key that owns every wallet; back it up |
| `CUSTODY_LIVE_TRADING` | `true` to sign and broadcast trades; anything else refuses them |
| `CUSTODY_MAX_TRADE_USD` | server-side per-trade ceiling, default 250 |
| `SOLANA_COMMITMENT` | `finalized` for real money |

`apps/web/.env.local`

| Variable | Notes |
| --- | --- |
| `API_ORIGIN` | where the Next **server** reaches Nest. `http://localhost:8000` in dev, `http://api:8000` in Docker |
| `NEXT_PUBLIC_BRAND` | `blip` · `flick` · `kite`. Set by `scripts/web.mjs` locally; per project when deployed |
| `NEXT_PUBLIC_PRIVY_APP_ID` | same app as the API's for that brand. Unset = demo build |

## What is real

Always real: prices, market caps, liquidity, graduation, bonding-curve quotes (fee, price impact, slippage floor), safety scores and wallet balances all come from the chain. Which tokens appear (trending, new, search), their names and art, and OHLCV history come from GeckoTerminal's public API. pump.fun's own read API now blocks servers with a bot challenge, so it is not used; see `apps/api/API.md`.

Custodial builds: balances, deposits, withdrawals and, with live trading switched on, buys and sells all happen on-chain from the held wallet. Card deposits, referral payouts and coaching payments are not integrated yet; the app says so rather than simulating them.

Demo builds: settlement is simulated. Fills are priced by a live quote, so they carry real fees and real curve impact, but nothing is signed.

Tests cover the transaction guard, tenant resolution, custody config and amount maths (`npm test`). Signing and broadcasting through Privy against mainnet has not been run end-to-end by automated tests.

Nothing is faked to fill a gap. Backend unreachable → the app says so instead of showing sample tokens. Safety score partial because an RPC call timed out → it carries an asterisk and the detail page explains why. SOL price stale or missing → dollar values are labelled or withheld.

See `apps/api/API.md` for endpoints, the custody safety checks and the upstream bugs this fixes; `apps/web/README.md` for the front-end architecture; `DEPLOY.md` for Render + Vercel.
