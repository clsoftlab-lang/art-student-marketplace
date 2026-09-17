// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// check.mjs — CI gate. Validates JSON, syntax-checks every JS file, verifies index.html
// required containers, and unit-tests the space-match recommender. Exit 1 on any failure.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import {
  scoreArtworkForSpace, recommendForSpace, sizeFitScore, colorScore
} from './js/recommend.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { console.error('FAIL  ' + m); failures++; };
function assert(cond, m) { cond ? ok(m) : bad(m); }

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log('\n[1] JSON files parse');
for (const f of walk(join(ROOT, 'data'))) {
  if (!f.endsWith('.json')) continue;
  try { const d = JSON.parse(readFileSync(f, 'utf8')); assert(Array.isArray(d) && d.length > 0, `${relative(ROOT, f)} (${d.length} rows)`); }
  catch (e) { bad(`${relative(ROOT, f)} — ${e.message}`); }
}

console.log('\n[2] JS syntax (node --check)');
for (const f of walk(ROOT)) {
  if (!/\.(mjs|js)$/.test(f)) continue;
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); ok(relative(ROOT, f)); }
  catch (e) { bad(`${relative(ROOT, f)} — ${String(e.stderr || e.message).split('\n')[0]}`); }
}

console.log('\n[3] index.html required containers');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const needle of ['id="app"', 'id="hamburger"', 'data-route', 'js/app.js', 'id="theme-toggle"', 'id="cart-count"']) {
  assert(html.includes(needle), `index.html contains ${needle}`);
}

console.log('\n[4] data integrity');
const artworks = JSON.parse(readFileSync(join(ROOT, 'data/artworks.json'), 'utf8'));
const artists = JSON.parse(readFileSync(join(ROOT, 'data/artists.json'), 'utf8'));
assert(artworks.length >= 36, `>= 36 artworks (${artworks.length})`);
assert(artists.length >= 6, `>= 6 artists (${artists.length})`);
const genres = new Set(artworks.map((a) => a.genre));
for (const g of ['회화', '일러스트', '판화', '조소']) assert(genres.has(g), `genre present: ${g}`);
const artistIds = new Set(artists.map((a) => a.id));
assert(artworks.every((a) => artistIds.has(a.artistId)), 'every artwork maps to a known artist');
assert(artworks.every((a) => a.seed != null && Array.isArray(a.colors) && a.colors.length >= 2 && a.composition), 'every artwork has seed/colors/composition (procedural art)');
assert(artworks.every((a) => a.price > 0 && a.widthCm > 0 && a.heightCm > 0), 'every artwork has valid price + dimensions');

console.log('\n[5] space-match recommender unit tests');
// sample artworks with controlled properties
const small = { id: 's', genre: '회화', colorTag: 'warm', sizeClass: 'small', widthCm: 30, heightCm: 30, price: 1, colors: ['#a'], composition: 'grid' };
const medWarm = { id: 'm', genre: '회화', colorTag: 'warm', sizeClass: 'medium', widthCm: 70, heightCm: 60, price: 1, colors: ['#a'], composition: 'grid' };
const bigCool = { id: 'b', genre: '회화', colorTag: 'cool', sizeClass: 'large', widthCm: 120, heightCm: 100, price: 1, colors: ['#a'], composition: 'grid' };
const smallWall = { wallWidthCm: 80, wallHeightCm: 80, colorTag: 'warm', purpose: 'home' };
const bigWall = { wallWidthCm: 220, wallHeightCm: 180, colorTag: 'warm', purpose: 'cafe' };

// 1. an oversized piece cannot fit a small wall
assert(sizeFitScore(bigCool, smallWall) === 0, 'oversized artwork scores 0 fit on small wall');
assert(scoreArtworkForSpace(bigCool, smallWall) === 0, 'non-fitting artwork total score is 0');
// 2. exact colour match beats a mismatch, all else equal
assert(colorScore(medWarm, bigWall) > colorScore(bigCool, bigWall), 'warm artwork scores higher colour on warm space');
// 3. every score is bounded [0,1]
for (const a of [small, medWarm, bigCool]) {
  const sc = scoreArtworkForSpace(a, bigWall);
  assert(sc >= 0 && sc <= 1, `score for ${a.id} in [0,1] (${sc})`);
}
// 4. recommender drops non-fitters and returns sorted, capped list
const recs = recommendForSpace([small, medWarm, bigCool], smallWall, 6);
assert(recs.every((r) => r.score > 0), 'recommendForSpace excludes non-fitting works');
assert(!recs.some((r) => r.art.id === 'b'), 'oversized work excluded from small-wall recs');
for (let i = 1; i < recs.length; i++) assert(recs[i - 1].score >= recs[i].score, `recs sorted desc at index ${i}`);
assert(recommendForSpace(artworks, bigWall, 3).length <= 3, 'recommender respects the n cap');
// 5. real seed data yields at least one recommendation for a large cafe wall
assert(recommendForSpace(artworks, bigWall, 8).length > 0, 'seed data produces recommendations for a large wall');

console.log(`\n${failures === 0 ? 'PASS' : 'FAILED'} — ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
