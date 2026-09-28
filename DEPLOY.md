# Deploying blip to Render

Two services come from one Blueprint (`render.yaml` at the repo root):

| Service | What it is | Health |
| --- | --- | --- |
| `blip-api` | NestJS market-data / trading API | `/api/ready` |
| `blip-web` | Next.js front end, proxies `/api/*` to the API | — |

The browser only ever calls same-origin `/api`, which the Next server
forwards to `API_ORIGIN` — so the API never needs to be publicly reachable
by browsers and no CORS setup is required for the app to work.

## 1. Put the repo on GitHub

```bash
git init                      # already done if this repo was committed
git add -A
git commit -m "blip: app + render blueprint"
git remote add origin https://github.com/<you>/blip.git
git push -u origin main
```

(Create the empty repo first at github.com/new — no README, no gitignore.)

## 2. Render → Blueprint

1. Go to <https://dashboard.render.com> → **New +** → **Blueprint**.
2. Connect GitHub (one-time OAuth) and pick the `blip` repo.
3. Render reads `render.yaml` and shows both services. It will ask for the
   two `sync: false` values:
   - `SOLANA_RPC_URL` — use a private endpoint (Helius / QuickNode). The
     public one rate-limits the safety-score lookups.
   - `CORS_ORIGIN` — `https://blip-web.onrender.com` (only matters for
     direct, non-proxied browser calls).
4. **Apply** — both services build and deploy.

## 3. Check it

- API: `https://blip-api.onrender.com/api/ready` → `{"status":"ok",...}`
- Web: `https://blip-web.onrender.com` → the landing page with live feed.

If Render suffixes a service name (name taken), copy the real URL into the
other service's env var (`API_ORIGIN` on web, `CORS_ORIGIN` on api) and
trigger a manual deploy.

## Notes

- **Free plans sleep** after ~15 min idle; the first request takes ~40s to
  wake. Upgrade a service to **starter** ($7/mo) for always-on.
- **The funding ledger is ephemeral on free plans** — `.funding-store/`
  (credited USDC deposits) lives on the instance disk and resets on
  redeploy. Attach a Render persistent disk (set `FUNDING_STORE_DIR`) before
  pointing real money at it.
- Deploys are automatic on every push to the connected branch (`autoDeploy`).
