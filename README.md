# Again Art (어게인 아트)

**A marketplace for art-student works** — paintings, illustrations, prints, and sculptures
that would otherwise be discarded after graduation exhibitions, resold or rented to
galleries, cafés, offices, and individuals.

> 한국어 설명은 [README.ko.md](./README.ko.md) 를 참고하세요.

**LIVE DEMO: https://clsoftlab-lang.github.io/art-student-marketplace/**

Zero build, zero dependencies, zero binaries. Every artwork you see is **generated on the
fly as inline SVG** from a numeric seed, so the gallery looks full and real without a single
image file.

---

## ⚠️ DEMO-MODE BOUNDARIES (read this first)

This repository is a **front-end demo**. In plain terms:

- **All artworks and artists are fictional.** Each "painting" is **procedurally generated SVG abstract art**, not a scan of a real work. Names, schools, and artist notes are invented.
- **localStorage is not a real database.** Your wishlist, cart, consignment submissions, and orders are saved **only in your own browser** and are lost when you clear site data. There is no server and no shared state.
- **No real payments, no real accounts, no PII.** "Buy" / "Rent" / "Checkout" are **simulated** — no card is charged, nothing is shipped, and no personal data is collected or transmitted.
- **No artist verification.** Anyone can "submit" a work in the demo; nothing is reviewed.

**A production build would add:** a backend + real database, authenticated accounts, real
image hosting/upload, a payment gateway and escrow, shipping/logistics, artist identity &
copyright verification, and rental contracts. None of that is here.

---

## Features

- **Gallery** — masonry grid with search and filters by **genre** (회화·일러스트·판화·조소), **color palette** (웜/쿨/파스텔/비비드/모노/어스), **size class**, and **buy/rent** availability; sort by newest, price, size, or title.
- **Artwork detail** — large generated artwork, artist note, medium, dimensions, palette swatches, and a **buy vs. rent** switch with **rental-period selection** (1 / 3 / 6 / 12 months) and live total.
- **Artist profile** — bio, school, and the artist's full body of work.
- **Space-matched recommendations** — enter your **wall size + preferred palette + purpose** (café / office / home) and get artworks ranked by a transparent matching score.
- **Consignment / submit-a-work** — a form where an artist "uploads" a piece; you pick a **color palette + composition** and a live SVG preview is generated. Saved to localStorage.
- **Wishlist / collection**, **cart**, and **simulated checkout** with an order confirmation.
- **Light + dark themes**, responsive **mobile-first** layout, drawer navigation, and a **DEMO data reset** button.

## How the procedural art works

`js/artgen.js` seeds a small deterministic PRNG (mulberry32) from each artwork's `seed`, then
draws one of six abstract **compositions** — `fields`, `strata`, `orbits`, `grid`, `flow`,
`shards` — using the artwork's color palette, finished with a subtle vignette. The same seed
always produces the same image, so cards are stable across reloads and every piece is unique.

## How space-matching works

`js/recommend.js` is a set of **pure functions** (no DOM, no storage) that score each artwork
for a space:

- **Size fit (50%)** — a piece that physically fits and occupies ~60% of the wall's limiting
  dimension scores best; anything larger than the wall is hard-zeroed.
- **Color match (30%)** — exact palette-tag match is best; related warm/cool families get partial credit.
- **Purpose (20%)** — each purpose (café/office/home) nudges preferred size and mood.

`recommendForSpace()` drops non-fitting works, sorts by score, and caps the list. These
functions are **unit-tested in CI** by `check.mjs`.

## 🤖 AI 기능 (API 연동) — AI features

The app ships a **pluggable AI layer** with three features, all wired into the UI:

1. **AI 작품 큐레이션 챗봇** (`#/ai`) — describe your space, taste, and budget in free text; the
   AI curator recommends real registered artworks (ranked with the space-match recommender).
2. **작가노트 / 작품 설명 생성** (`#/submit`) — one click drafts an artist's note from the piece's
   title, genre, medium, palette, and composition.
3. **공간 코디 추천 서술** (`#/spaces`) — for each recommendation, narrate *why* the piece fits a
   café / office / home.

**Demo = mock (default).** With `AI_ENDPOINT` empty in `ai/config.js`, a deterministic Korean
**MockProvider** answers entirely offline — no network, no key — reusing the app's own
artworks/artists data and the recommender, so the features visibly work out of the box.

**Enable real Claude.** Run the backend proxy and point the app at it:

```bash
cd server && npm install          # installs @anthropic-ai/sdk
cp .env.example .env              # then set ANTHROPIC_API_KEY=sk-ant-...
npm start                         # → http://localhost:8787
```

Then set the endpoint in `ai/config.js`:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

The proxy calls Claude (model `claude-opus-5`, adaptive thinking) and **streams** the response
back to the browser. See [`server/README.md`](./server/README.md) for details.

> **🔐 Keys are server-side only.** The `ANTHROPIC_API_KEY` lives **only** on the server
> (`server/.env` → `process.env.ANTHROPIC_API_KEY`). It is **never** placed in the browser,
> in `ai/config.js`, or anywhere in the repository. `.env` is gitignored, and `check.mjs`
> fails the build if anything shaped like a real key is ever committed.

## Run locally

No install, no build. Serve the folder over HTTP (ES modules require `http://`, not `file://`):

```bash
python -m http.server 8992
# then open http://localhost:8992
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

## Validate

```bash
node check.mjs
```

Checks that all JSON parses, every JS file passes `node --check`, `index.html` has its
required containers, the seed data is well-formed (36+ works across all genres), the
space-match recommender behaves correctly, the `ai/` and `server/` modules syntax-check,
`AI_ENDPOINT` ships empty, and **no real API key is committed anywhere**. This is the same
job the CI workflow runs. (CI never installs or calls the AI backend.)

## Tech & structure

Vanilla **HTML + CSS + ES-module JavaScript**. No framework, no bundler, relative paths only.

```
index.html            app shell + required containers
styles.css            mobile-first, light/dark, masonry
js/app.js             SPA bootstrap, hash router, all views
js/artgen.js          procedural SVG art from a seed
js/recommend.js       pure space-match recommender (unit-tested)
js/data.js            JSON loading + filter/sort + submissions merge
js/storage.js         localStorage wrapper (try/catch + reset)
js/util.js            formatting + DOM helpers
ai/config.js          AI_ENDPOINT switch (empty = offline mock)
ai/ai.js              askAI() — mock provider + streaming backend client
server/index.mjs      backend proxy (@anthropic-ai/sdk, key server-side)
server/.env.example   ANTHROPIC_API_KEY template (copy to .env)
data/artworks.json    42 fictional artworks
data/artists.json     12 fictional artists
check.mjs             CI validator + recommender unit tests + AI safety scan
```

## Contributors

- **Dr. Lee Il-guk (이일국)** — CLSOFTLAB
- **LWJ**
- **LMJ**
- **Claude** (Anthropic) — pair implementation

## License

- Code: **Apache-2.0** — see [LICENSE](./LICENSE).
- Documentation: **CC BY 4.0**.

SPDX headers (`Apache-2.0`) and the copyright
`Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)` are carried in the source files.

---

*Not an official Anthropic product.*

## 🎓 Idea origin

The seed idea for this project came from the **entrepreneurship class taught by Dr. Lee Il-guk (이일국) at Yongin University (용인대학교)**. The students in that class produced startup ideas of remarkable, standout creativity — this project is one of those exceptional ideas, finally brought to life as a working service. Built with deep admiration and gratitude for those students' imagination. *(No student personal information is included; only the idea itself was used, implemented clean-room.)*
