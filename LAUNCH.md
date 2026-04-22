# CostBurn — Launch Kit

Repo: **https://github.com/truckirwin-ai/costburn**

Local-first Claude Code cost dashboard + governor. Pulls live Anthropic Admin API spend, overlays a 6-lever what-if savings model, shows red before/after cut line on every bar. Zero-dep Node server, single-page HTML dashboard, macOS Keychain-backed admin key.

---

## One-liner

> Anthropic shows what you spent. CostBurn shows what you could have saved.

## Two-liner

> Free, local, zero-dependency dashboard for Claude Code spend. Paste your admin key, see real $/day, pick six levers, watch the red line show you 40–70% savings before you commit.

## 30-second elevator

Claude Code bills stack up fast. One runaway session can cost more than a good week. Anthropic's own console shows what you spent — not why, and not what you could have saved. CostBurn is the missing layer: same data, arranged so expensive patterns jump out, with six tunable cost levers and a live what-if savings model. Runs on your laptop. Key never leaves your Keychain. Free and open source.

---

## Install in 60 seconds

```bash
git clone https://github.com/truckirwin-ai/costburn
cd costburn
node serve.js
```

Open http://localhost:4173, paste your `sk-ant-admin01-…` key into the Admin Key card, click **Save** then **Test**. Done.

Requirements: Node 18+, macOS for Keychain storage (Linux/Windows still work, key lives in env var).

### Get an admin key

Anthropic Console → Settings → API keys → *Create admin key*. Read-only cost + usage access. Keep it secret.

---

## Feature bullets (for video captions, tweets, LinkedIn)

- Live Anthropic Admin API spend — paged `cost_report` + `usage_report/messages`
- 6-lever Cost Control Rack: session discipline, context bloat, phase boundary, retry-loop, model routing, daily USD cap
- Red **before/after** cut line on every bar — see savings when you move a lever
- Signal/Insights panel — auto-derived top cost-cut opportunities
- 7-day forecast (p50 / p90), Pareto concentration, efficiency quadrant, burn heatmap
- Two themes — dark IDE and Anthropic console-matched cream
- Local-first cache survives Anthropic rate limits
- macOS Keychain-backed admin key — browser never sees the secret
- Zero external runtime deps, Node 18 standard library only
- Single HTML file, single server file — audit it in 20 minutes

---

## YouTube structure (5-minute walkthrough)

**00:00 — Hook.** "One session cost me $760 in a day. Here's what I built next."

**00:15 — Problem.** Show Anthropic console cost page. Flat. No breakdown. No what-if.

**00:45 — CostBurn screen-share.** Launch `node serve.js`, open localhost:4173. Paste admin key.

**01:30 — The six levers.** Walk through Control Rack. Move each dropdown. Show the red cut line shift on every bar. Show the STACK chip row update.

**02:30 — Analytics.** Scroll: Signal/Insights (top cut opportunities), Pareto (80/20), efficiency quadrant (runaway sessions), burn heatmap.

**03:30 — Architecture.** One HTML file. One Node file. Zero deps. Show `security find-generic-password -s ANTHROPIC_ADMIN_KEY -w` to prove key is in Keychain, not on disk.

**04:15 — Install.** `git clone && node serve.js`. Done.

**04:45 — Ask.** Star the repo. PRs welcome. Link in description.

---

## Tweet / X thread

**Tweet 1**
One Claude Code session cost me $760 in a day.

Anthropic's dashboard showed me the number. Not why. Not what I could have saved.

So I built CostBurn. Local, free, open source. Six levers, live Anthropic spend, red "after" line on every bar. ↓

https://github.com/truckirwin-ai/costburn

**Tweet 2**
How it works: paste your admin key, pick a choice on each lever (session discipline, context bloat, phase boundary, retry, routing, daily cap). The red line on every bar shows post-governor spend. Move a lever, line shifts. No commit.

**Tweet 3**
Stack: one HTML file, one Node file, zero runtime deps. Admin key lives in macOS Keychain, never touches the browser. Chart.js from CDN, JetBrains Mono, TUI aesthetic. You can audit every line in 20 min.

**Tweet 4**
```bash
git clone https://github.com/truckirwin-ai/costburn
cd costburn && node serve.js
```

Open localhost:4173. MIT. PRs welcome.

---

## LinkedIn post

I spent $760 on a single Claude Code session last week. The Anthropic dashboard showed me the bill. It did not show me why, or what I could have saved.

So I built CostBurn — a local, zero-dependency dashboard that pulls your real Anthropic Admin API spend and overlays a six-lever what-if savings model. Every bar has a red "after governor" line. Move a lever, the line shifts. You see 40–70% projected savings before you change anything in your workflow.

Stack is deliberately tiny: one HTML file, one Node file, no runtime deps. Admin key lives in the macOS Keychain, never touches the browser.

Free and MIT-licensed. Install in 60 seconds:

```
git clone https://github.com/truckirwin-ai/costburn
cd costburn && node serve.js
```

Repo: https://github.com/truckirwin-ai/costburn

If you're running Claude Code at scale and one bad session can cost more than an average week, give it a spin.

#ClaudeCode #Anthropic #DeveloperTools #CostOptimization #OpenSource

---

## Thumbnail copy options

- "$760 in one day. Here's what I built."
- "The dashboard Anthropic didn't ship."
- "Cut Claude Code bills 40–70% — live demo"

---

## FAQ (for README v2 and video description)

**Q: Will this send my key anywhere?**
No. Admin key is stored in macOS Keychain (`security add-generic-password -s ANTHROPIC_ADMIN_KEY`). The Node process reads it, calls `api.anthropic.com` directly, returns JSON to the local browser. Browser never sees the key.

**Q: Does it work without an admin key?**
Yes. Falls back to local session estimates from `~/.claude/projects/` parsing. The dashboard still renders with KPIs, Pareto, quadrant, heatmap. The "actual spend" number will be estimated, not billed.

**Q: Is the savings model calibrated?**
Aggressions are derived from observed behavior on sessions >500 turns and cache-read share >70%. Real-world validation on the author's own $3,182 red-signal session. Adjust the constants in `index.html` under `LEVERS` to match your workflow.

**Q: Linux / Windows?**
Everything works except Keychain storage. Set `ANTHROPIC_ADMIN_KEY` as an env var instead.

**Q: Can I deploy this?**
Technically yes (single Node file, static HTML). Practically, the threat model assumes localhost. Don't expose the proxy without auth.

---

## Note to self

Built in one weekend chasing down a real $760/day burn spike on 2026-04-16. Core insight: cache-read accumulation is the dominant long-session cost driver, and the fix is upstream (fork sooner, cap context, route reads to Haiku) — not a bigger cache. The six levers map to that insight. Keep the model simple. Keep the UI dense. Never let the admin key touch the browser.
