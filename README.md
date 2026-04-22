# CostBurn

A local-first Claude Code cost dashboard + governor. Pulls real spend from the Anthropic Admin API, overlays a live savings model, and lets you tune six cost-control levers to see predicted impact before you commit.

![status](https://img.shields.io/badge/status-MVP-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![node](https://img.shields.io/badge/node-18%2B-blue)

## What it does

- **Actual spend** pulled live from `api.anthropic.com/v1/organizations/cost_report` and `usage_report/messages`
- **Cost Control Rack** — 6 dropdowns (session discipline, context bloat, phase boundary, retry-loop, model routing, daily USD cap) that stack into an aggression-weighted savings estimate
- **Before/after cut line** — every bar shows a red vertical marker at the post-governor position so you can see impact instantly when you change a lever
- **Signal/Insights** panel auto-derives top cost-cut opportunities (concentration, cache-read drag, outliers, runaway sessions, cost/turn spikes)
- **7-day forecast** with p50/p90 from rolling μ, σ
- **Pareto + efficiency quadrant + burn heatmap + model mix** — the analytics layer, not another bar chart
- **Two themes** — Dark (IDE/terminal) and Anthropic (warm cream + vivid accents, matches console.anthropic.com)
- **Local-first cache** — survives Anthropic rate limits; falls back to on-disk session estimates if the admin API is unreachable
- **Keychain-backed admin key** on macOS — key lives in Keychain only, the browser never sees it

## Quick start

```bash
git clone https://github.com/truckirwin-ai/costburn.git
cd costburn
node serve.js
# open http://localhost:4173
```

First load shows local session estimates. Paste your `sk-ant-admin01-…` key into the Admin Key card at the bottom, click **Save**, then **Test** — real Anthropic data flows in on the next refresh.

### Getting an admin key

Anthropic Console → Settings → API keys → *Create admin key*. Admin keys have read access to org-wide cost + usage reports. Keep them secret; CostBurn stores yours in the macOS Keychain under `ANTHROPIC_ADMIN_KEY`.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│ index.html  (TUI-styled SPA, JetBrains Mono + Chart.js) │
│   ├── Control Rack (6 levers, live savings)            │
│   ├── KPIs, Signal/Insights, Forecast                   │
│   ├── Pareto, Quadrant, Heatmap, Activity Mix           │
│   └── Daily, Projects, Sessions, Models                 │
└────────────────────────────────────────────────────────┘
                          │ fetch
                          ▼
┌────────────────────────────────────────────────────────┐
│ serve.js  (Node 18+, zero deps)                         │
│   ├── Static file server                                │
│   ├── /api/anthropic/cost  → cost_report (paged)        │
│   ├── /api/anthropic/usage → usage_report/messages      │
│   ├── 429 retry with Retry-After + exp backoff          │
│   ├── 5-minute in-memory cache                          │
│   └── macOS Keychain read/write for admin key           │
└────────────────────────────────────────────────────────┘
```

Zero build step. Zero external runtime dependencies. Chart.js loads from CDN.

## The cost model

CostBurn's savings model is built on the insight that **cache-read accumulation** is the dominant long-session cost driver. At Opus 4 rates:

| Token class | $/M tok |
|-------------|---------|
| Input       | $15.00  |
| Cache write | $18.75  |
| Cache read  | $1.50   |
| Output      | $75.00  |

Cache reads are cheap per token, but long sessions burn hundreds of millions of them. The six levers target different parts of that curve — context caps, forking, retry loops, model routing, etc. — and each one has an aggression weight. Select choices add up (capped at 70% of cache-read spend) and the dashboard re-projects everything live.

## Repo layout

```
costburn/
├── index.html    # UI (single file, ~1700 lines)
├── serve.js      # Node server + Anthropic proxy
├── README.md
└── LICENSE
```

## Why this exists

Anthropic's own dashboard shows you what you spent. It doesn't tell you *why*, or show you what you could have saved. CostBurn is the missing layer: the same data, arranged so the expensive patterns are impossible to miss, with a live what-if model attached.

If you're running Claude Code at scale and one bad session can cost more than an average week, you need this.

## License

MIT. See [LICENSE](./LICENSE).

## Author

Built by [Truck Irwin](https://github.com/truckirwin-ai) ([Foundry SMB](https://github.com/truckirwin-ai)) during a single weekend chasing down a $760 one-day burn spike.
