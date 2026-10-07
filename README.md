# See Links

Personal short links and QR codes on your own domain, with click and scan analytics.
Runs entirely on Cloudflare's free tier (Workers + D1) — one Worker does the redirects, the tracking, the API and serves the dashboard.

```
go.yourdomain.com/nom      →  302 to the destination, click recorded
go.yourdomain.com/admin    →  dashboard (password protected)
```

## What it does

- **Short links** on any domain you own, with a custom or random back-half
- **QR codes** with their own tracking slug, so scans and clicks are counted separately. Styling: patterns, corners, colors and gradients, logo upload or center text, frames with a label. Download as PNG or SVG.
- **Change the destination any time** — printed QR codes and shared links keep working
- **Dynamic routing** by device, OS or country (first matching rule wins)
- **UTM parameters** appended automatically, **expiration** with an optional fallback URL, **tags**, archive/restore
- **Analytics** per link, per QR code and overall: totals, unique visitors, daily chart vs. previous period, countries, cities, referrers, device/OS/browser, time of day, top links, CSV export
- **Bot filtering**: link-preview fetchers (Slack, KakaoTalk, Discord, X…), crawlers and CLI tools aren't counted
- **AI traffic**: assistants fetching your link (ChatGPT, Claude, Perplexity…) and people clicking from inside an assistant, shown separately
- **Privacy**: IPs are never stored. Each event keeps geo (from Cloudflare), referrer host, device info and a daily-rotating anonymous hash used only for unique counts.

## Deploy (about 10 minutes)

You need a Cloudflare account (the free plan is enough). A domain is optional: with `DOMAINS` left empty the service runs on `see-links.<your-subdomain>.workers.dev`, and you can add a custom domain later (a subdomain like `go.yourdomain.com` works great).

**Easiest: deploy from GitHub.** In the Cloudflare dashboard go to Workers & Pages → Create → Import a repository, pick this repo, and set:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy && npx wrangler d1 migrations apply see-links --remote`

Then add `ADMIN_PASSWORD` and `SESSION_SECRET` as secrets under the Worker's Settings → Variables and Secrets. Every push to `main` redeploys.

**Or from your terminal:**

```bash
npm install
npx wrangler login

# 1. (Optional) set your domain(s) and timezone in wrangler.jsonc → "vars"
#    DOMAINS = "go.yourdomain.com"   (comma-separate several; the first is the default)
#    and uncomment "routes" with the same domain(s), "custom_domain": true

# 2. Ship it — the D1 database is created on the first deploy
npm run deploy
npm run db:migrate:remote

# 3. Secrets
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET    # any long random string
```

Open `https://go.yourdomain.com/admin` and log in.

**Using a domain that already has a website (e.g. `play3.io/1` → `play3.io/notice`):** add it to both `DOMAINS` and `SHARED_DOMAINS`, and route it with `{ "pattern": "play3.io/*", "zone_name": "play3.io" }` instead of `custom_domain`. The domain's DNS must be on Cloudflare and proxied (orange cloud). The Worker then answers only for registered back-halves; every other path, including `/`, `/admin` and `/api`, goes to your site untouched, so the dashboard stays on the workers.dev address. Before creating a back-half the dashboard checks whether that path is already a page on your site and asks before covering it.

**Adding another domain later:** add it to `DOMAINS` and to `routes`, then `npm run deploy`. Links are created per domain, and each domain has its own back-half namespace.

## Local development

```bash
cp .dev.vars.example .dev.vars     # set a local password
npm run db:migrate:local
npm run dev                        # builds the dashboard and starts http://localhost:8787
```

On localhost every request is treated as the first domain in `DOMAINS`. For hot-reloading the UI, run `npm run dev:web` alongside `wrangler dev` (the API is proxied).

## How it fits together

| Path | What |
| --- | --- |
| `worker/index.ts` | Routes: `/api/*`, `/admin/*` (dashboard), `/:slug` (redirect) |
| `worker/redirect.ts` | Slug lookup → expiry → routing rules → UTM → 302; logs the event in the background |
| `worker/ua.ts` | Device/OS/browser parsing, bot and AI-assistant detection |
| `worker/analytics.ts` | All analytics queries in one D1 batch |
| `worker/api.ts` | Links CRUD, tags, title lookup, analytics, CSV/JSON export |
| `migrations/` | D1 schema (`links`, `slugs`, `events`) |
| `web/` | Dashboard (React + Vite), built into `dist/admin` |

A QR code is a property of a link with its own slug (`channel = 'qr'` on events). A "QR-only" code is a link with `show_link = 0`, which keeps it out of the Links list.

## Limits worth knowing

- Free tiers (check Cloudflare's pricing page for current numbers): Workers ~100k requests/day; D1 ~5 GB storage and ~100k rows written/day. Each click writes one row plus its index entries, so plan on roughly 30k tracked clicks a day before you'd need the paid plan.
- Redirects are `302` with `no-store`, so every visit reaches the Worker and gets counted.
- Back-halves `admin`, `api`, `assets`, `health` and `robots.txt` are reserved.
