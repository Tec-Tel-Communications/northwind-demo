# Tec-Tel production deploy runbook

This is the internal runbook for deploying the Northwind demo on the Tec-Tel
production server alongside `cw-bot-fastapi`, `tec-tel-portal`, and `cloudflared`.

Conventions match the cwAutomationPlat platform:

- Code lives under `/srv/AutomationsWorkspace/`
- Runs as the `tectel` user via systemd
- Exposed publicly via Cloudflare Tunnel (not nginx + certbot)
- Logs append to `/var/log/<service>.log`

The Node process listens on `127.0.0.1:7080` — adjacent to `cw-bot-fastapi`
(7072) and `tec-tel-portal` (8080). No public ports opened on the host.

## First-time deploy (~10 min)

```bash
# 1. As tectel, on the server
ssh tectel@<server>

# 2. Clone into the standard workspace
cd /srv/AutomationsWorkspace
git clone https://github.com/Tec-Tel-Communications/northwind-demo.git
cd northwind-demo

# 3. Install Node 18+ if not already present
node --version                    # need >= 18.17
# if missing:
# sudo apt update && sudo apt install -y nodejs npm

# 4. Install production dependencies only
npm ci --omit=dev

# 5. Create .env with the real key
cp .env.example .env
nano .env                          # paste ANTHROPIC_API_KEY=sk-ant-...
chmod 600 .env                     # tectel-only read

# 6. Quick smoke test before adding to systemd
PORT=7080 node server.js &
sleep 1
curl -s http://localhost:7080/healthz   # expect: ok
kill %1

# 7. Install the systemd unit (requires sudo)
sudo cp deploy/systemd/northwind-demo.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable northwind-demo
sudo systemctl start northwind-demo

# 8. Confirm it's healthy
sudo systemctl status northwind-demo
curl -s http://localhost:7080/healthz
tail -f /var/log/northwind-demo.log
```

## Cloudflare Tunnel route for demo.tec-tel.com

The tunnel daemon is already running (see `cwAutomationPlat/CLAUDE.md` for the
cloudflared setup). Add a new route to the same tunnel:

```bash
# Find the tunnel config
sudo find /etc -name "config.yml" -path "*cloudflared*" 2>/dev/null
# Typically: /home/tectel/.cloudflared/config.yml or /etc/cloudflared/config.yml
```

Edit the config to add a new ingress rule **before** the catch-all 404:

```yaml
ingress:
  # ...existing rules (portal, etc.)...
  - hostname: demo.tec-tel.com
    service: http://localhost:7080
  # catch-all (must be last)
  - service: http_status:404
```

Then add the DNS route and restart the tunnel:

```bash
cloudflared tunnel route dns <tunnel-name-or-id> demo.tec-tel.com
sudo systemctl restart cloudflared

# Verify the tunnel picked up the new route
sudo systemctl status cloudflared | grep -A2 "demo.tec-tel.com"
```

Cloudflare auto-provisions the TLS cert. `https://demo.tec-tel.com` should
respond within ~30 seconds.

## Update + restart (on every git push to main)

```bash
cd /srv/AutomationsWorkspace/northwind-demo
git pull
npm ci --omit=dev
sudo systemctl restart northwind-demo
tail -20 /var/log/northwind-demo.log
```

Optional: enable a tiny webhook or GitHub Actions self-hosted runner to
automate this. For a demo that changes rarely, manual is fine.

## Rollback

```bash
cd /srv/AutomationsWorkspace/northwind-demo
git log --oneline -5             # find the previous good SHA
git checkout <sha>
npm ci --omit=dev
sudo systemctl restart northwind-demo
```

## Logs + monitoring

```bash
# Live tail
tail -f /var/log/northwind-demo.log

# Last hour
journalctl -u northwind-demo --since "1 hour ago"

# Restart count / uptime
systemctl status northwind-demo

# Anthropic API spend
# Each chat request logs to /var/log/northwind-demo.log as
#   [<ISO timestamp>] chat: "<first 60 chars>"
# Grep for traffic patterns:
grep "chat:" /var/log/northwind-demo.log | wc -l    # total requests today
```

## Rate limiting

The server enforces 30 requests / IP / 10 minutes on `/api/chat` via
`express-rate-limit`. Tune in `server.js`:

```js
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,            // bump or lower as needed
  ...
});
```

`app.set('trust proxy', 1)` is set so `req.ip` reflects the real client
(Cloudflare's `CF-Connecting-IP` header through the tunnel), not the loopback
address.

## Cost notes

- **Hosting:** $0/mo (already-running server)
- **Anthropic API:** pay-per-request, ~$0.05–0.10 per typical demo conversation.
  At 50 conversations/mo, ~$5–15/mo. Rate limit caps the worst case.
- **DNS / TLS:** $0 (Cloudflare Tunnel handles both)
