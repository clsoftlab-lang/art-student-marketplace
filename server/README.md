<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->

# Again Art — AI proxy (server)

A tiny Node backend that turns the app's **DEMO (mock) AI** into **real Claude** without ever
exposing an API key to the browser.

> **The Anthropic API key lives ONLY on this server** (`.env` → `process.env.ANTHROPIC_API_KEY`).
> It is never placed in the browser, in `ai/config.js`, or anywhere in the repository. `.env`
> is gitignored. This is the whole point of the proxy.

## What it does

- Exposes `POST /api/ai` accepting `{ task, payload }` (the same shape `ai/ai.js` sends).
- Calls Claude via the official `@anthropic-ai/sdk`. **Cost-first default: `claude-haiku-4-5`**
  ($1 / $5 per MTok), configurable with `AI_MODEL` (raise to `claude-sonnet-5` or
  `claude-opus-5` for higher quality).
- **Prompt caching** on the stable per-task system prompt (`cache_control: ephemeral`) so
  repeated calls read the cache and cost less.
- **Cost guardrails:** per-IP rate limit (default 20/min) + a monthly token budget
  (`AI_MONTHLY_TOKEN_CAP`, default 2,000,000). When exceeded it returns HTTP 429
  `{fallback:true}`, and the app auto-falls back to the offline mock so it never breaks.
- Haiku 4.5 sends **no** thinking/effort (it does not accept them); Sonnet/Opus get adaptive
  thinking + `effort` (`AI_EFFORT`, default `low`).
- **Streams** the response back as `text/plain` chunks, which `ai/ai.js` reads token-by-token.
- Grounds every answer in the real artworks/artists data the browser includes in `payload`.
- `GET /health` returns `{ ok: true, model, monthlyTokenCap, tokensUsed }`.

## Setup

```bash
cd server
npm install                 # installs @anthropic-ai/sdk (do NOT run this in CI)
cp .env.example .env        # then edit .env and paste your key
# .env: ANTHROPIC_API_KEY=sk-ant-...
npm start                   # → http://localhost:8787
```

## Wire the frontend to it

Edit `ai/config.js` in the project root:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

Leave `AI_ENDPOINT` **empty** (`""`) to keep the offline mock provider (the default). With it
set, the same three features (curation chatbot, artist-note generation, space-styling
narrative) are answered by real Claude instead.

## Free serverless deploy — Cloudflare Workers (무인)

`server/worker.js` is a zero-dependency Cloudflare Workers variant (same `POST /api/ai`
contract, same model / caching / thinking rules). It calls the Anthropic REST API directly,
so on the Workers free tier there is **no server to babysit**.

```bash
cd server
npx wrangler deploy                       # deploys worker.js (see wrangler.toml)
npx wrangler secret put ANTHROPIC_API_KEY # paste sk-ant-... — stored as a Worker SECRET
```

Then point the frontend at the deployed Worker URL:

```js
// ai/config.js
export const AI_ENDPOINT = "https://again-art-ai.<your-subdomain>.workers.dev/api/ai";
```

The key lives **only** in the Worker secret (never in `wrangler.toml`, the browser, or the
repo). Tune the model/effort via the `[vars]` block in `wrangler.toml` or the dashboard.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Required.** Your Anthropic key (`sk-ant-...`). Server-side only. |
| `AI_MODEL` | `claude-haiku-4-5` | Model. Raise to `claude-sonnet-5` / `claude-opus-5` for quality. |
| `AI_EFFORT` | `low` | Effort for Sonnet/Opus (ignored on Haiku). |
| `AI_MONTHLY_TOKEN_CAP` | `2000000` | Monthly token budget; over it → 429 `{fallback:true}`. |
| `AI_RATE_LIMIT_PER_MIN` | `20` | Per-IP requests/minute; over it → 429 `{fallback:true}`. |
| `PORT` | `8787` | Port the proxy listens on. |
| `ALLOWED_ORIGIN` | `*` | CORS allow-origin. In production, set to your site's exact origin. |

## Security notes

- **Never** put the key in the browser, in `ai/config.js`, or in any committed file.
- Keep `ALLOWED_ORIGIN` tight in production; consider adding rate limiting and auth in front
  of this proxy before exposing it publicly.
- This proxy is intentionally minimal (Node core `http` + the SDK) — no framework, one file.

---

*Not an official Anthropic product.*
