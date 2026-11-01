# blip API

NestJS API behind every blip-family front end: market data, safety scoring, curve quotes, and the custodial wallets the app holds for its users.

```bash
cp .env.example .env     # or `npm run setup` from the repo root
npm run start:dev        # http://localhost:8000/api
npm test                 # unit tests
```

| Module | Routes | What it does |
| --- | --- | --- |
| `feed` | `/api/feed*` | discover list and token detail, safety-scored and priced in USD |
| `pump` | `/api/pump/*` | curve quotes; unsigned PumpPortal transactions and `/submit` for self-custody wallets |
| `custody` | `/api/custody/*` | Privy-held wallet per user per brand: account, trade, withdraw |
| `portfolio` | `/api/portfolio/:address` | any wallet's holdings, valued at realistic exit |
| `funding` | `/api/funding/*` | demo-mode USDC watch on a user-owned wallet |
| `wallet` | `/api/wallet/:address/*` | raw SOL / token balances |
| `tokens` | `/api/tokens/*` | raw pump.fun passthrough (legacy surface) |
| — | `/health`, `/api/ready` | liveness / readiness |

Every endpoint and the custody safety checks are documented in `API.md`. All configuration is in `.env.example`.
