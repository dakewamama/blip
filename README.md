# blip

Memecoin trading on Solana. Next.js front end and a NestJS market-data / trading API, in one npm workspace.

```
blip/
├─ apps/web    Next.js 15 · App Router · React 19
├─ apps/api    NestJS 10 · pump.fun + Solana RPC
└─ scripts/    env setup
```

## Run it

```bash
npm install
npm run setup     # writes apps/api/.env and apps/web/.env.local from the examples
npm run dev       # api on :8000, web on :3000
```

Open http://localhost:3000. One command starts both; output is prefixed `api` / `web`.

Production:

```bash
npm run build
npm start
```

Other scripts: `npm run typecheck` (both apps), `npm run dev:api`, `npm run dev:web`.

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
| `SOLANA_RPC_URL` | **use a private endpoint.** The public one rate-limits `getTokenLargestAccounts` within a few requests and every safety score comes back `complete: false` |
| `PUMP_API_BASES` | optional override of the pump.fun mirror list |

`apps/web/.env.local`

| Variable | Notes |
| --- | --- |
| `API_ORIGIN` | where the Next **server** reaches Nest. `http://localhost:8000` in dev, `http://api:8000` in Docker |

## What is real

Real, from the chain: the feed, safety scores, SOL price, market caps, liquidity, bonding-curve quotes (fee, price impact, slippage floor), OHLCV history, and read-only wallet balances.

Simulated: settlement. Buys and sells are *priced* by a live quote, so fills carry real fees and real curve impact — but nothing is signed or broadcast. `POST /api/pump/submit` exists and is tested; connecting a wallet adapter is the remaining step to live execution.

Nothing is faked to fill a gap. Backend unreachable → the app says so instead of showing sample tokens. Safety score partial because an RPC call timed out → it carries an asterisk and the detail page explains why. SOL price stale or missing → dollar values are labelled or withheld.

See `apps/api/API.md` for endpoints and the list of upstream bugs this fixes, and `apps/web/README.md` for the front-end architecture.
