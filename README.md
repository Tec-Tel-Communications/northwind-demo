# Tec-Tel · AI Operations Advisory — public sales site + live demo

A single-page sales site for **Tec-Tel · AI Operations Advisory**. Marketing
copy, capabilities + roadmap, pricing tiers, and a **working embedded chat
demo** trained on the fictional Northwind Logistics business — all in one
page. Same visual design system as the Jetro × Dragonfruit microsite.

The Anthropic API key never leaves the server. The `NORTHWIND_CONTEXT` system
prompt is baked into `server.js` so prospects can't read or modify it via
devtools.

## What's on the page

1. **Nav** — Tec-Tel logo + AI Operations Advisory badge + jump links
2. **Hero** — headline, sub, two CTAs, four proof chips
3. **Live demo** — embedded "morning portal" framed as a device:
   - Three expandable morning items (Cisco, Freezer Zone 3, AR aging)
   - "Everything else is handled" panel
   - KPI strip
   - Inline chat with starter chips → POSTs `/api/chat`
4. **How it works** — 4-step process flow
5. **Capabilities &amp; roadmap** — Live Today / In Dev / On the Horizon
6. **Integration** — "We're integrators first" + 60-day guarantee
7. **Pricing** — POV ($15K · 60 days) → 3 monthly tiers + 4 phases
8. **Final CTA** — book a call (mailto) + contact card
9. **Footer** — disclaimer + branding

## Stack

- Node 18+ / Express (single `server.js`)
- Static frontend (`public/index.html` + `public/styles.css`) — vanilla JS,
  no build step, design system shared with the Jetro microsite
- Anthropic Messages API (`claude-sonnet-4-20250514`)
- `/api/chat` rate-limited to 30 reqs/IP per 10 min

## Local run

```bash
cd northwind-demo
npm install
cp .env.example .env       # then put your real key in .env
npm run dev                # http://localhost:3000
```

Open http://localhost:3000. Click the three items, expand "Everything else is handled," click a chip, or type into the chat.

## Endpoints

- `GET /` — serves the portal
- `POST /api/chat` — body `{ messages: [{role, content}, ...] }` → `{ reply: "..." }`
- `GET /healthz` — returns `ok` for uptime monitoring

Each chat request is logged to stdout as `[<ISO timestamp>] chat: "<first 60 chars>"`.

## Deploy — Tec-Tel production server (primary)

Hosts alongside `cw-bot-fastapi` and `tec-tel-portal` on the existing
Linux box. Exposed via Cloudflare Tunnel — no certbot, no port forwarding.

Step-by-step runbook with the exact paths, systemd unit, and Cloudflare
tunnel route lives in [`deploy/TEC-TEL-PROD.md`](deploy/TEC-TEL-PROD.md).

The systemd unit ships in this repo at
[`deploy/systemd/northwind-demo.service`](deploy/systemd/northwind-demo.service).
It runs Node as the `tectel` user, listens on `127.0.0.1:7080`, and logs
to `/var/log/northwind-demo.log`.

### Update + restart

```bash
cd /srv/AutomationsWorkspace/northwind-demo
git pull
npm ci --omit=dev
sudo systemctl restart northwind-demo
```

## Deploy — Render (alternative)

If you'd rather host on a PaaS instead of your own box:

1. Push the repo to GitHub.
2. In Render: **New → Web Service → Connect this repo**.
3. Settings: Node · Build `npm install` · Start `npm start` ·
   Instance type **Starter ($7/mo)** so the dyno stays warm (Free tier
   sleeps after 15 min, which makes the demo URL feel broken).
4. **Environment Variables:** add `ANTHROPIC_API_KEY`.
5. **Health Check Path:** `/healthz`.
6. Custom domain: Settings → Custom Domain → add `demo.tec-tel.com` and
   point a CNAME at the URL Render gives you. Cert auto-provisions.

Auto-deploys on every `git push origin main`.

## Deploy — Fly.io (alternative)

```bash
fly launch          # accept defaults, skip Postgres / Redis
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

## Notes

- No auth, no database, no analytics beyond the request log. Each visitor starts fresh.
- All business numbers are fictional. The system prompt instructs the model to stay internally consistent if a prospect asks something it covers indirectly.
- Mobile responsive at <700px (header stacks, KPI grid becomes 2×2).
- To edit the system prompt or the three morning items, edit the `SYSTEM_PROMPT` constant in `server.js` and the matching `items` array in `public/index.html` together — they need to stay in sync.
