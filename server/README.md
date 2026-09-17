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
- Calls Claude (`claude-opus-5`, adaptive thinking) via the official `@anthropic-ai/sdk`.
- **Streams** the response back as `text/plain` chunks, which `ai/ai.js` reads token-by-token.
- Grounds every answer in the real artworks/artists data the browser includes in `payload`.
- `GET /health` returns `{ ok: true, model }`.

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

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Required.** Your Anthropic key (`sk-ant-...`). Server-side only. |
| `PORT` | `8787` | Port the proxy listens on. |
| `ALLOWED_ORIGIN` | `*` | CORS allow-origin. In production, set to your site's exact origin. |

## Security notes

- **Never** put the key in the browser, in `ai/config.js`, or in any committed file.
- Keep `ALLOWED_ORIGIN` tight in production; consider adding rate limiting and auth in front
  of this proxy before exposing it publicly.
- This proxy is intentionally minimal (Node core `http` + the SDK) — no framework, one file.

---

*Not an official Anthropic product.*
