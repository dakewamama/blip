# trigger2nest-backend

NestJS API for the Pump.fun controller. Runs standalone on port 8000.

```bash
cp .env.example .env
npm install
npm run start:dev
```

Routes:
- `pump/*` — pump.fun operations
- `tokens/*` — token listing and detail
- `api/trading/*` — buy/sell
- `api/wallet/*` — balances and wallet state
- `health` — status check

Config (`.env`): `PORT` (default 8000), `CORS_ORIGIN` (default `http://localhost:5173`),
`SOLANA_RPC_URL`, `SOLANA_NETWORK`.

The frontend is a separate package and talks to this service over HTTP only —
no shared source, no imports across the boundary.
