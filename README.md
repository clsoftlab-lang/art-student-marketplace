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
required containers, the seed data is well-formed (36+ works across all genres), and the
space-match recommender behaves correctly. This is the same job the CI workflow runs.

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
data/artworks.json    42 fictional artworks
data/artists.json     12 fictional artists
check.mjs             CI validator + recommender unit tests
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
