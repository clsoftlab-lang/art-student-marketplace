// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// app.js — SPA bootstrap, hash router, and every view. DEMO mode: all data is
// fictional and persisted to localStorage; no backend, no real payments.

import { artSVG } from './artgen.js';
import { recommendForSpace, PURPOSE_PROFILE } from './recommend.js';
import * as store from './storage.js';
import * as db from './data.js';
import { won, esc, h, qs, toast, sizeLabel } from './util.js';
import { askAI, curatePicks } from '../ai/ai.js';
import { AI_ENDPOINT } from '../ai/config.js';

const app = qs('#app');
const GENRE_COLORS = { '회화': '#e76f51', '일러스트': '#8338ec', '판화': '#2a9d8f', '조소': '#c1502e' };

/* ---------- shared pieces ---------- */

function artThumb(art) {
  const wrap = h('div', { class: 'thumb' });
  wrap.innerHTML = artSVG(art, { width: 600 });
  return wrap;
}

function badge(text, color) {
  return h('span', { class: 'badge', style: color ? `--bc:${color}` : '' }, text);
}

function heartBtn(art) {
  const active = store.inWishlist(art.id);
  const b = h('button', {
    class: 'heart' + (active ? ' on' : ''), 'aria-label': '찜하기', title: '찜하기',
    onclick: (e) => {
      e.preventDefault(); e.stopPropagation();
      const now = store.toggleWishlist(art.id);
      b.classList.toggle('on', now);
      b.textContent = now ? '♥' : '♡';
      toast(now ? '찜 목록에 담았습니다' : '찜을 해제했습니다');
      updateCounts();
    }
  }, active ? '♥' : '♡');
  return b;
}

function artCard(art) {
  const artist = db.getArtist(art.artistId);
  const card = h('a', { class: 'card', href: `#/art/${art.id}` });
  const media = h('div', { class: 'card-media' }, [artThumb(art), heartBtn(art)]);
  if (art.userSubmitted) media.append(badge('위탁 등록', '#6b705c'));
  const body = h('div', { class: 'card-body' }, [
    h('div', { class: 'card-title' }, art.title),
    h('div', { class: 'card-artist' }, artist ? artist.name : '작가 미상'),
    h('div', { class: 'card-meta' }, [
      badge(art.genre, GENRE_COLORS[art.genre]),
      h('span', { class: 'dim' }, sizeLabel(art))
    ]),
    h('div', { class: 'card-price' }, [
      h('strong', {}, won(art.price)),
      art.forRent ? h('span', { class: 'rent' }, `대여 ${won(art.rentPricePerMonth)}/월`) : null
    ])
  ]);
  card.append(media, body);
  return card;
}

/* ---------- gallery ---------- */

let filters = { q: '', genre: '', colorTag: '', sizeClass: '', availability: '', sort: 'newest' };

function galleryView() {
  app.innerHTML = '';
  const hero = h('section', { class: 'hero' }, [
    h('h1', {}, '버려질 뻔한 졸업 작품에, 두 번째 벽을'),
    h('p', {}, '전시가 끝나면 창고로 사라지던 미술대학생들의 작품을 갤러리·카페·사무실·개인에게 다시 잇습니다.')
  ]);

  const controls = h('div', { class: 'controls' });
  const search = h('input', {
    type: 'search', class: 'search', placeholder: '작품·작가·재료·색감 검색',
    value: filters.q, 'aria-label': '검색',
    oninput: (e) => { filters.q = e.target.value; renderGrid(); }
  });

  const chip = (label, key, val) => h('button', {
    class: 'chip' + (filters[key] === val ? ' on' : ''),
    onclick: () => { filters[key] = filters[key] === val ? '' : val; galleryView(); }
  }, label);

  const genreRow = h('div', { class: 'chips' }, [
    h('span', { class: 'chips-label' }, '장르'),
    ...db.GENRES.map((g) => chip(g, 'genre', g))
  ]);
  const colorRow = h('div', { class: 'chips' }, [
    h('span', { class: 'chips-label' }, '색감'),
    ...db.COLOR_TAGS.map((c) => {
      const b = chip(c.label, 'colorTag', c.tag);
      b.classList.add('chip-color'); b.dataset.tag = c.tag; return b;
    })
  ]);
  const sizeRow = h('div', { class: 'chips' }, [
    h('span', { class: 'chips-label' }, '크기'),
    ...db.SIZE_CLASSES.map((s) => chip(s.label, 'sizeClass', s.v))
  ]);
  const availRow = h('div', { class: 'chips' }, [
    h('span', { class: 'chips-label' }, '거래'),
    chip('구매 가능', 'availability', 'buy'),
    chip('대여 가능', 'availability', 'rent')
  ]);

  const sort = h('select', {
    class: 'sort', 'aria-label': '정렬',
    onchange: (e) => { filters.sort = e.target.value; renderGrid(); }
  });
  [['newest', '최신순'], ['price-asc', '가격 낮은순'], ['price-desc', '가격 높은순'],
   ['size-desc', '크기 큰순'], ['title', '제목순']].forEach(([v, l]) => {
    const o = h('option', { value: v }, l); if (v === filters.sort) o.selected = true; sort.append(o);
  });

  const reset = h('button', { class: 'link-btn', onclick: () => {
    filters = { q: '', genre: '', colorTag: '', sizeClass: '', availability: '', sort: 'newest' }; galleryView();
  } }, '필터 초기화');

  controls.append(search, genreRow, colorRow, sizeRow, availRow,
    h('div', { class: 'controls-foot' }, [sort, reset]));

  const grid = h('div', { class: 'grid', id: 'grid' });
  const count = h('div', { class: 'result-count', id: 'result-count' });
  app.append(hero, controls, count, grid);

  function renderGrid() {
    const list = db.queryArtworks(filters);
    count.textContent = `${list.length}점의 작품`;
    grid.innerHTML = '';
    if (!list.length) { grid.append(h('p', { class: 'empty' }, '조건에 맞는 작품이 없습니다.')); return; }
    list.forEach((a) => grid.append(artCard(a)));
  }
  renderGrid();
}

/* ---------- detail ---------- */

function detailView(id) {
  const art = db.getArtwork(id);
  app.innerHTML = '';
  if (!art) { app.append(notFound()); return; }
  const artist = db.getArtist(art.artistId);

  const big = h('div', { class: 'detail-media' });
  big.innerHTML = artSVG(art, { width: 900 });

  let mode = art.forRent ? 'rent' : 'buy';
  let months = 3;

  const priceBox = h('div', { class: 'buy-box' });
  function renderBuyBox() {
    priceBox.innerHTML = '';
    const tabs = h('div', { class: 'mode-tabs' });
    const buyTab = h('button', { class: 'mode-tab' + (mode === 'buy' ? ' on' : ''), onclick: () => { mode = 'buy'; renderBuyBox(); } }, `구매 ${won(art.price)}`);
    tabs.append(buyTab);
    if (art.forRent) tabs.append(h('button', { class: 'mode-tab' + (mode === 'rent' ? ' on' : ''), onclick: () => { mode = 'rent'; renderBuyBox(); } }, '대여'));
    priceBox.append(tabs);

    if (mode === 'rent') {
      const sel = h('select', { class: 'sort', 'aria-label': '대여 기간', onchange: (e) => { months = +e.target.value; renderBuyBox(); } });
      [1, 3, 6, 12].forEach((m) => { const o = h('option', { value: m }, `${m}개월`); if (m === months) o.selected = true; sel.append(o); });
      priceBox.append(h('div', { class: 'rent-row' }, [h('span', {}, '대여 기간'), sel]));
      priceBox.append(h('div', { class: 'total-row' }, [h('span', {}, '예상 합계'),
        h('strong', {}, `${won(art.rentPricePerMonth * months)} (${won(art.rentPricePerMonth)}/월)`)]));
    } else {
      priceBox.append(h('div', { class: 'total-row' }, [h('span', {}, '구매가'), h('strong', {}, won(art.price))]));
    }

    const addBtn = h('button', { class: 'btn primary', onclick: () => {
      store.addToCart({ id: art.id, mode, months: mode === 'rent' ? months : 0 });
      toast('장바구니에 담았습니다'); updateCounts();
    } }, '장바구니 담기');
    const buyNow = h('button', { class: 'btn', onclick: () => {
      store.addToCart({ id: art.id, mode, months: mode === 'rent' ? months : 0 });
      updateCounts(); location.hash = '#/cart';
    } }, mode === 'rent' ? '바로 대여' : '바로 구매');
    priceBox.append(h('div', { class: 'buy-actions' }, [addBtn, buyNow, heartBtn(art)]));
    priceBox.append(h('p', { class: 'demo-note' }, 'DEMO 모드 — 실제 결제/배송은 이루어지지 않습니다.'));
  }
  renderBuyBox();

  const info = h('div', { class: 'detail-info' }, [
    h('a', { class: 'crumb', href: '#/' }, '← 갤러리'),
    h('h1', {}, art.title),
    artist ? h('a', { class: 'detail-artist', href: `#/artist/${artist.id}` }, `${artist.name} · ${artist.school}`) : null,
    h('div', { class: 'detail-badges' }, [
      badge(art.genre, GENRE_COLORS[art.genre]),
      badge(colorTagLabel(art.colorTag)),
      art.userSubmitted ? badge('위탁 등록', '#6b705c') : null
    ]),
    palette(art),
    h('dl', { class: 'spec' }, [
      specRow('재료', art.medium), specRow('크기', sizeLabel(art)),
      specRow('제작연도', String(art.year)), specRow('색감', art.paletteName)
    ]),
    h('h3', {}, '작가노트'),
    h('p', { class: 'note' }, art.artistNote),
    priceBox
  ]);

  const wrap = h('section', { class: 'detail' }, [big, info]);
  app.append(wrap);

  // similar works (same genre or color)
  const sim = db.allArtworks().filter((a) => a.id !== art.id && (a.genre === art.genre || a.colorTag === art.colorTag)).slice(0, 4);
  if (sim.length) {
    app.append(h('h2', { class: 'section-h' }, '비슷한 작품'));
    const g = h('div', { class: 'grid' }); sim.forEach((a) => g.append(artCard(a))); app.append(g);
  }
  window.scrollTo(0, 0);
}

const specRow = (k, v) => h('div', { class: 'spec-row' }, [h('dt', {}, k), h('dd', {}, v)]);
const colorTagLabel = (t) => (db.COLOR_TAGS.find((c) => c.tag === t) || { label: t }).label;

function palette(art) {
  return h('div', { class: 'palette' }, (art.colors || []).map((c) =>
    h('span', { class: 'swatch', style: `background:${c}`, title: c })));
}

/* ---------- artist ---------- */

function artistView(id) {
  const artist = db.getArtist(id);
  app.innerHTML = '';
  if (!artist) { app.append(notFound()); return; }
  const works = db.artworksByArtist(id);
  app.append(h('section', { class: 'artist-head' }, [
    h('a', { class: 'crumb', href: '#/' }, '← 갤러리'),
    h('h1', {}, artist.name),
    h('p', { class: 'artist-school' }, `${artist.school} · ${artist.city}`),
    h('p', { class: 'artist-bio' }, artist.bio),
    h('p', { class: 'dim' }, `등록 작품 ${works.length}점 · ${artist.joinedYear}년 합류`)
  ]));
  const g = h('div', { class: 'grid' });
  works.forEach((a) => g.append(artCard(a)));
  app.append(works.length ? g : h('p', { class: 'empty' }, '등록된 작품이 없습니다.'));
  window.scrollTo(0, 0);
}

/* ---------- space recommender ---------- */

let space = { wallWidthCm: 200, wallHeightCm: 150, colorTag: '', purpose: 'cafe' };

function spacesView() {
  app.innerHTML = '';
  app.append(h('section', { class: 'page-head' }, [
    h('h1', {}, '공간 맞춤 추천'),
    h('p', {}, '벽 크기·색감·공간 용도를 입력하면 어울리는 작품을 점수순으로 추천합니다.')
  ]));

  const form = h('form', { class: 'space-form', onsubmit: (e) => { e.preventDefault(); renderRecs(); } });
  const wIn = numField('벽 너비 (cm)', space.wallWidthCm, (v) => space.wallWidthCm = v);
  const hIn = numField('벽 높이 (cm)', space.wallHeightCm, (v) => space.wallHeightCm = v);

  const purposeSel = h('select', { class: 'sort', onchange: (e) => space.purpose = e.target.value });
  Object.entries(PURPOSE_PROFILE).forEach(([k, v]) => { const o = h('option', { value: k }, v.label); if (k === space.purpose) o.selected = true; purposeSel.append(o); });
  const colorSel = h('select', { class: 'sort', onchange: (e) => space.colorTag = e.target.value });
  colorSel.append(h('option', { value: '' }, '색감 무관'));
  db.COLOR_TAGS.forEach((c) => { const o = h('option', { value: c.tag }, c.label); if (c.tag === space.colorTag) o.selected = true; colorSel.append(o); });

  form.append(
    wIn, hIn,
    h('label', { class: 'fld' }, [h('span', {}, '공간 용도'), purposeSel]),
    h('label', { class: 'fld' }, [h('span', {}, '선호 색감'), colorSel]),
    h('button', { class: 'btn primary', type: 'submit' }, '추천 받기')
  );
  app.append(form);
  const out = h('div', { id: 'recs' });
  app.append(out);

  function renderRecs() {
    const recs = recommendForSpace(db.allArtworks(), space, 8);
    out.innerHTML = '';
    out.append(h('h2', { class: 'section-h' }, `추천 ${recs.length}점`));
    if (!recs.length) { out.append(h('p', { class: 'empty' }, '입력한 벽 크기에 맞는 작품이 없습니다. 벽 크기를 키워보세요.')); return; }
    const g = h('div', { class: 'grid' });
    recs.forEach(({ art, score }) => {
      const card = artCard(art);
      const m = qs('.card-media', card);
      m.append(h('span', { class: 'score', title: '매칭 점수' }, `매칭 ${Math.round(score * 100)}%`));
      // AI 공간 코디 서술 — narrate why this piece fits the chosen space.
      const narr = h('div', { class: 'ai-answer ai-narr', 'aria-live': 'polite' });
      const nbtn = h('button', { class: 'btn ai-btn', type: 'button' }, '✦ AI 공간 코디');
      nbtn.addEventListener('click', () => runAI('spaceNarrative',
        { art, space: { ...space }, artists: db.allArtists() },
        { target: narr, button: nbtn, label: '✦ AI 공간 코디' }));
      g.append(h('div', { class: 'rec-cell' }, [card, h('div', { class: 'ai-btn-row' }, [nbtn, aiModeBadge()]), narr]));
    });
    out.append(g);
  }
  renderRecs();
  window.scrollTo(0, 0);
}

function numField(label, val, on) {
  const inp = h('input', { type: 'number', min: '10', max: '2000', value: val, class: 'search', oninput: (e) => on(Math.max(0, +e.target.value || 0)) });
  return h('label', { class: 'fld' }, [h('span', {}, label), inp]);
}

/* ---------- AI: shared helpers ---------- */

// Small pill telling the user which AI provider is active (mock vs. real backend).
function aiModeBadge() {
  return h('span', { class: 'ai-mode', title: AI_ENDPOINT ? '실 AI 백엔드 연결됨' : 'DEMO 목업 AI (오프라인)' },
    AI_ENDPOINT ? 'AI · 실연동' : 'AI · DEMO');
}

// Render streamed AI text into a target element; toggles a "생성 중" state on the button.
async function runAI(task, payload, { target, button, label } = {}) {
  if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = '생성 중…'; }
  if (target) target.textContent = '';
  try {
    await askAI(task, payload, { onToken: (chunk) => { if (target) target.textContent += chunk; } });
  } catch (e) {
    if (target) target.textContent = `AI 응답을 불러오지 못했습니다: ${e.message}`;
    else toast('AI 응답 오류');
  } finally {
    if (button) { button.disabled = false; button.textContent = button.dataset.label || label || 'AI 생성'; }
  }
}

/* ---------- AI: 작품 큐레이션 챗봇 ---------- */

const aiState = { message: '', budget: 0, wallWidthCm: 0, wallHeightCm: 0, purpose: 'home' };

function aiView() {
  app.innerHTML = '';
  app.append(h('section', { class: 'page-head' }, [
    h('div', { class: 'page-head-row' }, [h('h1', {}, 'AI 작품 큐레이션'), aiModeBadge()]),
    h('p', {}, '원하는 공간·분위기·예산을 자유롭게 적어주세요. AI 큐레이터가 실제 등록 작품 중에서 어울리는 작품을 추천합니다.')
  ]));

  const form = h('form', { class: 'space-form', onsubmit: (e) => { e.preventDefault(); ask(); } });
  const msg = h('textarea', {
    class: 'search', rows: '3',
    placeholder: '예) 따뜻한 웜톤의 회화를 카페 벽에 걸고 싶어요. 예산은 50만원 정도예요.',
    value: aiState.message, oninput: (e) => aiState.message = e.target.value
  });
  const purposeSel = h('select', { class: 'sort', onchange: (e) => aiState.purpose = e.target.value });
  Object.entries(PURPOSE_PROFILE).forEach(([k, v]) => { const o = h('option', { value: k }, v.label); if (k === aiState.purpose) o.selected = true; purposeSel.append(o); });

  form.append(
    h('label', { class: 'fld' }, [h('span', {}, '무엇을 찾으시나요?'), msg]),
    h('div', { class: 'two' }, [
      h('label', { class: 'fld' }, [h('span', {}, '예산 상한 (원, 선택)'),
        h('input', { type: 'number', min: '0', class: 'search', value: aiState.budget || '', oninput: (e) => aiState.budget = Math.max(0, +e.target.value || 0) })]),
      h('label', { class: 'fld' }, [h('span', {}, '공간 용도'), purposeSel])
    ]),
    h('div', { class: 'two' }, [
      numField('벽 너비 (cm, 선택)', aiState.wallWidthCm || '', (v) => aiState.wallWidthCm = v),
      numField('벽 높이 (cm, 선택)', aiState.wallHeightCm || '', (v) => aiState.wallHeightCm = v)
    ]),
    h('button', { class: 'btn primary', type: 'submit' }, 'AI 추천 받기')
  );
  app.append(form);

  const answer = h('div', { class: 'ai-answer', 'aria-live': 'polite' });
  const cards = h('div', {});
  app.append(h('div', { class: 'ai-out' }, [answer, cards]));

  function payload() {
    return {
      message: aiState.message, budget: aiState.budget,
      space: { wallWidthCm: aiState.wallWidthCm, wallHeightCm: aiState.wallHeightCm, purpose: aiState.purpose },
      artworks: db.allArtworks(), artists: db.allArtists(), n: 4
    };
  }
  async function ask() {
    if (!aiState.message.trim()) { toast('원하시는 내용을 입력해주세요'); return; }
    const btn = qs('button[type=submit]', form);
    cards.innerHTML = '';
    await runAI('curate', payload(), { target: answer, button: btn });
    // Show the matching artworks the recommender selected (kept in sync with the AI's prose).
    const picks = curatePicks(payload());
    if (picks.length) {
      cards.append(h('h2', { class: 'section-h' }, `추천 작품 ${picks.length}점`));
      const g = h('div', { class: 'grid' });
      picks.forEach(({ art, score }) => {
        const card = artCard(art);
        if (score) { const m = qs('.card-media', card); m.append(h('span', { class: 'score', title: '매칭 점수' }, `매칭 ${Math.round(score * 100)}%`)); }
        g.append(card);
      });
      cards.append(g);
    }
  }
  window.scrollTo(0, 0);
}

/* ---------- consignment submit ---------- */

function submitView() {
  app.innerHTML = '';
  app.append(h('section', { class: 'page-head' }, [
    h('h1', {}, '작품 위탁 등록'),
    h('p', {}, '전시 후 보관 중인 작품을 등록해보세요. 색상 팔레트를 고르면 미리보기가 생성됩니다.')
  ]));

  const state = { title: '', artistName: '', genre: '회화', medium: '', widthCm: 60, heightCm: 80,
    year: 2025, price: 300000, forRent: true, rentPricePerMonth: 20000, colorTag: 'warm', note: '' };
  const palettes = [
    ['warm', ['#F4A259', '#E76F51', '#F7C59F', '#8C3B2B']],
    ['cool', ['#264653', '#2A9D8F', '#8AB6C4', '#123040']],
    ['pastel', ['#F7CAD0', '#CDB4DB', '#A8E6CF', '#BDB2FF']],
    ['vivid', ['#FF006E', '#FB5607', '#FFBE0B', '#3A86FF']],
    ['monochrome', ['#1B1B1E', '#3F3F46', '#7A7A82', '#C9C9CE']],
    ['earth', ['#8A5A44', '#A47148', '#D6BFA9', '#5C4433']]
  ];
  let colors = palettes[0][1];
  const comps = ['fields', 'strata', 'orbits', 'grid', 'flow', 'shards'];
  let composition = comps[0];
  let seed = Math.floor(Math.random() * 1e6);

  const preview = h('div', { class: 'detail-media preview' });
  const drawPreview = () => { preview.innerHTML = artSVG({ seed, colors, composition, title: state.title || '미리보기', widthCm: state.widthCm, heightCm: state.heightCm }, { width: 600 }); };
  drawPreview();

  const form = h('form', { class: 'submit-form', onsubmit: (e) => {
    e.preventDefault();
    if (!state.title.trim() || !state.artistName.trim()) { toast('제목과 작가명을 입력하세요'); return; }
    const artistId = 'user-' + slug(state.artistName);
    if (!db.getArtist(artistId)) { /* virtual artist held via submission */ }
    const id = 'user-art-' + Date.now();
    const art = {
      id, title: state.title.trim(), artistId, artistName: state.artistName.trim(),
      genre: state.genre, medium: state.medium || '혼합재료',
      year: +state.year, widthCm: +state.widthCm, heightCm: +state.heightCm,
      sizeClass: Math.max(state.widthCm, state.heightCm) < 40 ? 'small' : Math.max(state.widthCm, state.heightCm) <= 80 ? 'medium' : 'large',
      price: +state.price, forRent: !!state.forRent, rentPricePerMonth: state.forRent ? +state.rentPricePerMonth : 0,
      paletteName: colorTagLabel(state.colorTag), colorTag: state.colorTag, colors, composition, seed,
      artistNote: state.note || '작가가 직접 위탁 등록한 작품입니다.', tags: [state.genre, state.colorTag], userSubmitted: true
    };
    store.addSubmission(art);
    db.refresh();
    // register a lightweight virtual artist entry for profile pages
    ensureVirtualArtist(art);
    toast('작품이 등록되었습니다 (DEMO — localStorage에 저장)');
    location.hash = `#/art/${id}`;
  } });

  const txt = (label, key, type = 'text') => {
    const inp = h('input', { type, class: 'search', value: state[key], oninput: (e) => { state[key] = type === 'number' ? +e.target.value : e.target.value; if (key === 'title') drawPreview(); } });
    return h('label', { class: 'fld' }, [h('span', {}, label), inp]);
  };

  const genreSel = h('select', { class: 'sort', onchange: (e) => state.genre = e.target.value });
  db.GENRES.forEach((g) => { const o = h('option', { value: g }, g); if (g === state.genre) o.selected = true; genreSel.append(o); });

  const paletteRow = h('div', { class: 'palette-choose' }, palettes.map(([tag, cols]) => {
    const sw = h('button', { type: 'button', class: 'pal-opt' + (tag === state.colorTag ? ' on' : ''), title: colorTagLabel(tag), onclick: () => {
      state.colorTag = tag; colors = cols; qs('.palette-choose', form).querySelectorAll('.pal-opt').forEach((x) => x.classList.remove('on')); sw.classList.add('on'); drawPreview();
    } }, cols.map((c) => h('span', { style: `background:${c}` })));
    return sw;
  }));

  const compRow = h('div', { class: 'chips' }, [h('span', { class: 'chips-label' }, '구성'),
    ...comps.map((c) => h('button', { type: 'button', class: 'chip' + (c === composition ? ' on' : ''), onclick: (e) => {
      composition = c; compRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); drawPreview();
    } }, c))]);

  const shuffle = h('button', { type: 'button', class: 'link-btn', onclick: () => { seed = Math.floor(Math.random() * 1e6); drawPreview(); } }, '↻ 미리보기 다시 생성');
  const rentChk = h('label', { class: 'fld chk' }, [
    h('input', { type: 'checkbox', checked: state.forRent, onchange: (e) => state.forRent = e.target.checked }),
    h('span', {}, '대여 가능')
  ]);

  const noteArea = h('textarea', { class: 'search', rows: '4', oninput: (e) => state.note = e.target.value });
  const aiNoteBtn = h('button', { type: 'button', class: 'btn ai-btn' }, '✦ AI 작가노트 생성');
  // Stream the generated note straight into the textarea, keeping state.note in sync.
  aiNoteBtn.addEventListener('click', async () => {
    const payload = { title: state.title, genre: state.genre, medium: state.medium, colorTag: state.colorTag, composition, artistName: state.artistName, keywords: state.note };
    aiNoteBtn.disabled = true; const lbl = aiNoteBtn.textContent; aiNoteBtn.textContent = '생성 중…'; noteArea.value = '';
    try {
      await askAI('artistNote', payload, { onToken: (c) => { noteArea.value += c; state.note = noteArea.value; } });
      state.note = noteArea.value;
    } catch (e) { toast('AI 응답 오류: ' + e.message); }
    finally { aiNoteBtn.disabled = false; aiNoteBtn.textContent = lbl; }
  });

  form.append(
    txt('작품 제목', 'title'), txt('작가명', 'artistName'),
    h('label', { class: 'fld' }, [h('span', {}, '장르'), genreSel]),
    txt('재료', 'medium'),
    h('div', { class: 'two' }, [txt('너비(cm)', 'widthCm', 'number'), txt('높이(cm)', 'heightCm', 'number')]),
    h('div', { class: 'two' }, [txt('제작연도', 'year', 'number'), txt('판매가(원)', 'price', 'number')]),
    rentChk, txt('월 대여가(원)', 'rentPricePerMonth', 'number'),
    h('label', { class: 'fld' }, [h('span', {}, '색상 팔레트'), paletteRow]),
    compRow, shuffle,
    h('label', { class: 'fld' }, [
      h('div', { class: 'fld-head' }, [h('span', {}, '작가노트'), aiModeBadge()]),
      noteArea,
      h('div', { class: 'ai-btn-row' }, [aiNoteBtn, h('span', { class: 'dim ai-hint' }, '제목·장르·재료·색감을 채운 뒤 눌러보세요')])
    ]),
    h('button', { class: 'btn primary', type: 'submit' }, '위탁 등록하기'),
    h('p', { class: 'demo-note' }, 'DEMO 모드 — 등록 정보는 이 브라우저의 localStorage에만 저장됩니다.')
  );

  app.append(h('div', { class: 'submit-wrap' }, [
    h('div', { class: 'submit-preview' }, [h('h3', {}, '미리보기'), preview]),
    form
  ]));
  window.scrollTo(0, 0);
}

const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '') || 'anon';
function ensureVirtualArtist(art) {
  if (db.getArtist(art.artistId)) return;
  db.allArtists().push({ id: art.artistId, name: art.artistName, school: '위탁 작가', city: '-', bio: '위탁 등록 작가입니다.', joinedYear: 2026 });
}

/* ---------- wishlist ---------- */

function wishlistView() {
  app.innerHTML = '';
  const ids = store.getWishlist();
  const works = ids.map((id) => db.getArtwork(id)).filter(Boolean);
  app.append(h('section', { class: 'page-head' }, [h('h1', {}, '나의 찜 · 컬렉션'), h('p', {}, `${works.length}점을 찜했습니다.`)]));
  if (!works.length) { app.append(h('p', { class: 'empty' }, '아직 찜한 작품이 없습니다. 갤러리에서 ♡ 를 눌러보세요.')); return; }
  const g = h('div', { class: 'grid' }); works.forEach((a) => g.append(artCard(a))); app.append(g);
}

/* ---------- cart + checkout ---------- */

function cartView() {
  app.innerHTML = '';
  const cart = store.getCart();
  app.append(h('section', { class: 'page-head' }, [h('h1', {}, '장바구니')]));
  if (!cart.length) { app.append(h('p', { class: 'empty' }, '장바구니가 비어 있습니다.')); return; }

  let total = 0;
  const list = h('div', { class: 'cart-list' });
  cart.forEach((c) => {
    const art = db.getArtwork(c.id); if (!art) return;
    const line = c.mode === 'rent' ? art.rentPricePerMonth * (c.months || 1) : art.price;
    total += line;
    const thumb = h('a', { class: 'cart-thumb', href: `#/art/${art.id}` }); thumb.innerHTML = artSVG(art, { width: 200 });
    list.append(h('div', { class: 'cart-row' }, [
      thumb,
      h('div', { class: 'cart-info' }, [
        h('a', { class: 'cart-title', href: `#/art/${art.id}` }, art.title),
        h('div', { class: 'dim' }, c.mode === 'rent' ? `대여 · ${c.months}개월` : '구매'),
        h('div', {}, won(line))
      ]),
      h('button', { class: 'link-btn', onclick: () => { store.removeFromCart(c.id, c.mode); updateCounts(); cartView(); } }, '삭제')
    ]));
  });

  const checkout = h('button', { class: 'btn primary', onclick: () => {
    const order = { id: 'ORD-' + Date.now(), items: cart, total, date: new Date().toISOString() };
    store.addOrder(order); store.clearCart(); updateCounts();
    app.innerHTML = '';
    app.append(h('section', { class: 'page-head confirm' }, [
      h('div', { class: 'check-ico' }, '✓'),
      h('h1', {}, '주문이 완료되었습니다'),
      h('p', {}, `주문번호 ${order.id} · 합계 ${won(total)}`),
      h('p', { class: 'demo-note' }, 'DEMO 모드 — 실제 결제·정산·배송은 발생하지 않습니다.'),
      h('a', { class: 'btn', href: '#/' }, '갤러리로 돌아가기')
    ]));
    window.scrollTo(0, 0);
  } }, '모의 결제하기');

  app.append(list, h('div', { class: 'cart-foot' }, [
    h('div', { class: 'cart-total' }, [h('span', {}, '합계'), h('strong', {}, won(total))]),
    checkout,
    h('p', { class: 'demo-note' }, 'DEMO 모드 — 결제 정보는 입력받지 않으며 실제 거래가 없습니다.')
  ]));
  window.scrollTo(0, 0);
}

/* ---------- misc ---------- */

function notFound() {
  return h('section', { class: 'page-head' }, [h('h1', {}, '페이지를 찾을 수 없습니다'), h('a', { class: 'btn', href: '#/' }, '갤러리로')]);
}

function updateCounts() {
  const wc = qs('#wish-count'), cc = qs('#cart-count');
  if (wc) { const n = store.getWishlist().length; wc.textContent = n; wc.hidden = !n; }
  if (cc) { const n = store.getCart().length; cc.textContent = n; cc.hidden = !n; }
}

/* ---------- router ---------- */

function router() {
  const hash = location.hash || '#/';
  const [, route, param] = hash.replace(/^#/, '').split('/');
  qsAllNav(route);
  if (!route || route === 'gallery' || route === '') galleryView();
  else if (route === 'art') detailView(param);
  else if (route === 'artist') artistView(param);
  else if (route === 'spaces') spacesView();
  else if (route === 'ai') aiView();
  else if (route === 'submit') submitView();
  else if (route === 'wishlist') wishlistView();
  else if (route === 'cart') cartView();
  else galleryView();
  closeDrawer();
}

function qsAllNav(route) {
  document.querySelectorAll('[data-route]').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === (route || 'gallery'));
  });
}

function closeDrawer() { document.body.classList.remove('drawer-open'); }

/* ---------- theme + chrome wiring ---------- */

function initTheme() {
  const saved = store.getTheme();
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  const btn = qs('#theme-toggle');
  if (btn) btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.setTheme(next);
  });
}

function initChrome() {
  const ham = qs('#hamburger');
  if (ham) ham.addEventListener('click', () => document.body.classList.toggle('drawer-open'));
  const scrim = qs('#scrim');
  if (scrim) scrim.addEventListener('click', closeDrawer);
  const reset = qs('#reset-demo');
  if (reset) reset.addEventListener('click', () => {
    if (confirm('DEMO 데이터(찜·장바구니·위탁 등록·주문)를 모두 초기화할까요?')) {
      store.resetAll(); db.refresh(); updateCounts(); toast('초기화되었습니다'); location.hash = '#/'; router();
    }
  });
}

/* ---------- boot ---------- */

async function boot() {
  initTheme();
  initChrome();
  try {
    await db.loadData();
  } catch (e) {
    app.innerHTML = '<p class="empty">데이터를 불러오지 못했습니다. 로컬 서버(예: python -m http.server)로 실행해 주세요.</p>';
    return;
  }
  // rebuild virtual artists for any existing submissions
  store.getSubmissions().forEach((s) => ensureVirtualArtist(s));
  updateCounts();
  window.addEventListener('hashchange', router);
  router();
}

boot();
