# Northwind Logistics — AI Morning Portal

A sales demo for **Tec-Tel · AI Operations Advisory**. Prospects see what an AI-powered executive morning view looks like for a fictional cold-storage company, and can chat with an AI that knows the business inside and out.

The Anthropic API key never leaves the server. The system prompt is baked into `server.js` so prospects can't see or modify it via devtools.

## Stack

- Node 18+ / Express (single `server.js`)
- Static frontend (`public/index.html`) — vanilla JS, inline CSS, no build step
- Anthropic Messages API (`claude-sonnet-4-20250514`)

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

## Deploy — Render (recommended, ~5 min)

Render runs the Express process unmodified. Free tier is fine for a demo.

1. Push the repo to GitHub.
2. In Render: **New → Web Service → Connect this repo**.
3. Settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance:** Free
4. **Environment Variables:** add `ANTHROPIC_API_KEY` with your real key.
5. Click **Create Web Service**. First deploy takes ~2 min.
6. Render gives you a `*.onrender.com` URL. To use `northwind.tec-tel.com`:
   - Render → your service → **Settings → Custom Domain → Add `northwind.tec-tel.com`**.
   - Add the CNAME record Render shows you to Tec-Tel's DNS. Cert auto-provisions.

### One-command deploy after initial setup

```bash
git push origin main
```

Render auto-deploys on push.

## Deploy — Fly.io (alternative)

```bash
fly launch          # accept defaults, skip Postgres / Redis
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

## Deploy — VPS (alternative)

```bash
# on the box
git clone <repo>
cd northwind-demo
npm install --omit=dev
ANTHROPIC_API_KEY=sk-ant-... PORT=3000 node server.js
# (front with nginx + certbot for the subdomain)
```

## Notes

- No auth, no database, no analytics beyond the request log. Each visitor starts fresh.
- All business numbers are fictional. The system prompt instructs the model to stay internally consistent if a prospect asks something it covers indirectly.
- Mobile responsive at <700px (header stacks, KPI grid becomes 2×2).
- To edit the system prompt or the three morning items, edit the `SYSTEM_PROMPT` constant in `server.js` and the matching `items` array in `public/index.html` together — they need to stay in sync.
