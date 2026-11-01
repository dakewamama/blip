# Deploying

One API on Render, three front ends on Vercel, all built from this repo.

| Where | Service | What it is |
| --- | --- | --- |
| Render | `blip-api` → https://blip-api-j0d4.onrender.com | NestJS API, health at `/api/ready` |
| Render | `blip-web` | the blip front end, from the same Blueprint — optional now that Vercel serves blip |
| Vercel | `blip-web` → https://blip-web-seven.vercel.app | `apps/web` with `NEXT_PUBLIC_BRAND=blip` |
| Vercel | `flick-web` → https://flick-web-fawn.vercel.app | `apps/web` with `NEXT_PUBLIC_BRAND=flick` |
| Vercel | `kite-web` → https://kite-web-green.vercel.app | `apps/web` with `NEXT_PUBLIC_BRAND=kite` |

Browsers only call same-origin `/api`, which each front end's Next server forwards to `API_ORIGIN`. So no CORS setup is needed between Vercel and Render.

## API: Render

`render.yaml` is a Blueprint with `autoDeploy`. Pushing to `main` redeploys the API.

- **First time:** Render Dashboard → **New +** → **Blueprint** → pick this repo → **Apply**.
- **New env vars:** env vars added to `render.yaml` appear on the service at the next sync. Fill the `sync: false` ones in the dashboard:
  - `SOLANA_RPC_URL` — a private endpoint (Helius, QuickNode or Triton). The public one rate-limits safety scoring.
  - `PRIVY_APP_ID` and `PRIVY_APP_SECRET` — see *Turning custody on* below.
  - `PRIVY_AUTHORIZATION_KEY` — optional.
- **Free plan:** the API sleeps after ~15 minutes idle, and the first request after that takes about 40 seconds. The front ends retry while it wakes. The Starter plan keeps it up.

## Front ends: Vercel

Each brand is its own Vercel project with Root Directory `apps/web`, framework Next.js, and two env vars:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_BRAND` | `blip`, `flick` or `kite` |
| `API_ORIGIN` | `https://blip-api-j0d4.onrender.com` |

These are the commands used to set them up, run from the repo root:

```bash
for b in blip flick kite; do
  vercel project add $b-web
  vercel project update $b-web --root-directory apps/web --framework nextjs
  vercel env add NEXT_PUBLIC_BRAND production --value $b --project $b-web --yes
  vercel env add API_ORIGIN production --value https://blip-api-j0d4.onrender.com --project $b-web --yes
  vercel deploy --prod --project $b-web
done
```

`.vercelignore` keeps local build output, `node_modules` and secrets out of the upload. Vercel installs from the root lockfile, because the workspace manifests are uploaded with `apps/web`.

`NEXT_PUBLIC_*` values are inlined at build time. After changing one, redeploy that project: `vercel deploy --prod --project <brand>-web`.

To redeploy from Git instead of the CLI, connect the repo to each project in the Vercel dashboard (Settings → Git). The root directory is already set.

## Turning custody on

Until this is done, every front end runs as a labelled demo build with simulated balances.

1. **Privy apps.** In [dashboard.privy.io](https://dashboard.privy.io), create one app per brand. A shared app works too, but login emails then carry one brand's name.
   - Enable Email, and optionally Google and Apple.
   - Under allowed origins, add each front end's production URL (above).
2. **API (Render).**
   - Set `PRIVY_APP_ID` and `PRIVY_APP_SECRET`.
   - For separate apps, add `PRIVY_APP_ID_FLICK` / `PRIVY_APP_SECRET_FLICK` and the same for `_KITE`. Unsuffixed values cover blip and any brand without its own.
3. **Front ends (Vercel).** Set `NEXT_PUBLIC_PRIVY_APP_ID` on each project to that brand's app ID, then redeploy it.
4. **Optional: an authorization key**, so the app secret alone cannot move funds:
   ```bash
   openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 -w0
   ```
   - Set the output as `PRIVY_AUTHORIZATION_KEY` before the first user signs up. It only applies to wallets created after it is set.
   - Store a copy offline. Losing it locks every wallet it owns.
5. **Live trading.** `CUSTODY_LIVE_TRADING` stays `false` until you have checked, with a small amount, that deposits, a buy, a sell and a withdrawal all work end to end. Then set it to `true` on the API.
   - Without it, users can still deposit, see balances and withdraw.
   - `CUSTODY_MAX_TRADE_USD` caps every buy on the server.

Holding user funds can bring licensing and KYC/AML obligations, depending on where your users are. Settle that before live trading goes on.

## Notes

- **Wallet mapping:** which user owns which wallet is stored in Privy, as each wallet's `external_id`. A Render redeploy cannot lose it.
- **Demo USDC ledger:** the `.funding-store/` ledger is the only thing on the instance disk, and it resets on redeploy. Custodial balances are on-chain and don't depend on it.
- **Render service names:** if Render suffixes a service name, put the real API URL in `API_ORIGIN` on every front end and redeploy.
