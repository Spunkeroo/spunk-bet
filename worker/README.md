# Spunk.Bet Analytics Worker

Real cross-user analytics powered by Cloudflare Workers + KV.

## Quick Deploy (5 minutes)

### 1. Install Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 2. Create KV Namespace
```bash
cd worker
wrangler kv:namespace create ANALYTICS
```
Copy the `id` from the output and paste it into `wrangler.toml`.

### 3. Deploy
```bash
wrangler deploy
```
Note the URL it gives you (e.g. `https://spunk-analytics.YOUR.workers.dev`).

### 4. Update the Site
In `index.html`, find this line:
```js
const ANALYTICS_WORKER = '';
```
Set it to your worker URL:
```js
const ANALYTICS_WORKER = 'https://spunk-analytics.YOUR.workers.dev';
```
Commit and push.

## What Gets Tracked

| Metric | How |
|--------|-----|
| Unique visitors (daily/weekly) | IP hashed per day (privacy-safe) |
| Page views | Every page navigation |
| Games played (by type) | Every bet placed |
| Wager volume | Sum of all bets |
| Faucet claims | Each claim |
| Wallet connects | Each connect |
| X shares | Each share action |
| Referral clicks | Each ?ref= visit |
| Countries | From CF-IPCountry header |
| Devices | Mobile vs desktop |
| Hourly distribution | UTC hour of visits |

## Console Commands

On spunk.bet, open browser console:

- `spunkStats()` — Shows local + live stats
- `spunkAdmin()` — Full admin dashboard (7-day breakdown, games, countries, devices, hourly)

## API Endpoints

- `GET /stats` — Public stats (safe to expose)
- `GET /stats/admin` — Detailed breakdown (consider adding auth later)
- `POST /track` — Event tracking (called automatically by site)

## Cost

Cloudflare Workers free tier: 100K requests/day, 1GB KV storage.
More than enough for early growth.
