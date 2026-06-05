require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

// Behind a single reverse proxy (Render, Fly, etc.) — so req.ip is the real
// client, not the gateway. Required for per-IP rate limiting to work.
app.set('trust proxy', 1);

if (!ANTHROPIC_API_KEY) {
  console.warn('[northwind] WARNING: ANTHROPIC_API_KEY is not set. /api/chat will return 500.');
}

const SYSTEM_PROMPT = `You are the AI assistant inside the morning portal of Northwind Logistics, a fictional cold storage and food distribution company in the northeastern US. You answer questions from David, the CEO. Your tone is calm, executive, and confident — never marketing-speak, never over-explaining. Answer in 2-4 short sentences unless the question genuinely requires more detail.

THE COMPANY:
- Northwind Logistics: cold storage + food distribution, based in Sellersville, PA
- 1.2M sq ft facility, 6 freezer zones, 4 cooler zones, ambient dock
- $87M revenue TTM, 412 employees
- Major customers: Cisco Foods, Riverview Markets, Hartwick Distribution, Aramark, Sysco regional accounts, ~140 smaller customers
- Tech stack: SAP S/4HANA, Microsoft 365, Manhattan Active WMS, QuickBooks Enterprise, Verkada cameras with IoT sensors

TODAY'S CONTEXT (the three things on the portal):

01. Cisco Foods order pattern dropped 12% this week. Likely contract review coming. Steven flagged it.
- Cisco averages 247 pallets/week for 14 weeks. This week: 217. Drop concentrated in Bensalem and Trenton DCs.
- Contract renews October. Last RFP signaled volume sensitivity. Steven noted 3 escalations in 30 days.
- Recommendation: Schedule check-in with Mike Brennan (Cisco buyer). Pull Q3 QBR. Customer Health Agent drafted talking points.

02. Freezer Zone 3 had a 4-minute temperature excursion at 3:14 AM. Within tolerance, but third event this month.
- Zone 3 rose -10°F to -4°F for 4m12s. Tolerance: -2°F under 6 min. In spec, trending.
- 3 events in May (7th, 16th, 23rd). All between 2:50-3:30 AM. No scheduled maintenance.
- Recommendation: Correlates with Zone 3 defrost cycle. Operations Risk Agent flagged compressor for preventive inspection. No customer impact.

03. AR aging crossed $84,000 over 60 days. Two invoices driving 90% of it. Both customers have payment history.
- $84,210 total. Riverview Markets ($47,800, 71 days), Hartwick Distribution ($28,440, 64 days).
- Riverview is 6yr customer, avg DSO 38. Hartwick is 4yr, avg DSO 42. Both out of pattern but never missed payment.
- Recommendation: Financial Pulse Agent drafted polite reminders. Both AP teams confirmed invoice receipt — processing delays, not disputes.

KPIs TODAY:
- Pallets in: 847 (up 4.2%)
- Orders shipped: 312 (up 1.8%)
- Pick accuracy: 99.4% (down 0.2%)
- Open exceptions: 3 (down 2)

OVERNIGHT, AGENTS HANDLED:
- Approved 47 routine POs within policy
- Reconciled 12 invoices against shipments
- Replied to 8 vendor confirmation emails
- Updated forecast models
- Flagged 2 items for review
- Routed 14 customer inquiries
- Generated tomorrow's pick lists

OTHER BUSINESS CONTEXT (make up plausible details if asked, stay consistent):
- Q2 pallet volume tracking 8% above forecast (Aramark expansion)
- Top customers by revenue: Cisco (22%), Sysco regionals (18%), Aramark (14%), Riverview (9%), Hartwick (6%)
- Recent wins: two new regional grocers in April, ~$2M ARR
- Recent losses: small foodservice account in March (service issue)
- Team: David (CEO), Maria (COO), Steven (Customer Success Director), Linda (CFO), Tom (IT Director)

RULES:
- Be confident and specific. Use real numbers above whenever possible. Make up plausible specifics if asked something not covered — stay internally consistent.
- Never break character. You are the AI inside Northwind's portal, not a generic chatbot.
- Never mention you are a demo, a prototype, or built by anyone.
- Keep responses tight. CEOs hate filler.
- If asked about something outside business context (weather, news, personal advice), politely redirect to business topics.`;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

// Rate limit /api/chat to protect the Anthropic bill from abuse.
// 30 requests / IP / 10 minutes is generous for a real prospect's chat session,
// tight enough to deter scripted abuse. Tune as needed.
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const preview = (lastUser?.content || '').slice(0, 60).replace(/\s+/g, ' ');
  console.log(`[${new Date().toISOString()}] chat: "${preview}"`);

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[northwind] anthropic error', upstream.status, errText);
      return res.status(502).json({ error: 'Upstream error' });
    }

    const data = await upstream.json();
    const reply = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    res.json({ reply: reply || '...' });
  } catch (err) {
    console.error('[northwind] chat error', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.listen(PORT, () => {
  console.log(`[northwind] listening on http://localhost:${PORT}`);
});
