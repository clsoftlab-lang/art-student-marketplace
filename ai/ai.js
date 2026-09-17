// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/ai.js — pluggable AI client. One entry point, two providers:
//
//   askAI(task, payload, { onToken } = {})
//     • AI_ENDPOINT === ""  → deterministic Korean MockProvider (offline, DEMO mode).
//     • AI_ENDPOINT set      → POST {task, payload} to the backend proxy and stream tokens.
//
// The MockProvider reuses the app's real artworks/artists data (passed via payload) and the
// space-match recommender from js/recommend.js, so demo answers are grounded, not random.
//
// Supported tasks:
//   'curate'         — AI 작품 큐레이션 챗봇: recommend artworks from space/taste/budget.
//   'artistNote'     — 작가노트 / 작품 설명 생성.
//   'spaceNarrative' — 공간 코디 추천 서술: why a piece fits a café/office/home.

import { AI_ENDPOINT } from './config.js';
import { recommendForSpace, PURPOSE_PROFILE } from '../js/recommend.js';

const won = (n) => '₩' + (Number(n) || 0).toLocaleString('ko-KR');
const PURPOSE_LABEL = { cafe: '카페', office: '사무실', home: '가정/거실' };
const COLOR_LABEL = {
  warm: '웜톤', cool: '쿨톤', pastel: '파스텔', vivid: '비비드',
  monochrome: '모노톤', earth: '어스톤', neutral: '뉴트럴'
};

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

// Ask the AI. Returns a Promise<string> of the full text; if `onToken` is given it is
// invoked with each streamed chunk as it arrives (both in mock and real mode).
export async function askAI(task, payload = {}, { onToken } = {}) {
  if (!AI_ENDPOINT) {
    const text = mockAnswer(task, payload);
    return streamOut(text, onToken);
  }
  return fetchStream(task, payload, onToken);
}

// Deterministically select artworks for a curation request, reusing the recommender.
// Exported so the UI can render matching cards alongside the AI's prose (kept in sync).
export function curatePicks(payload = {}) {
  const arts = payload.artworks || [];
  if (!arts.length) return [];
  const budget = Number(payload.budget) || 0;
  const taste = parseTaste(payload.message || '');
  const space = { ...(payload.space || {}) };
  if (!space.colorTag && taste.colorTag) space.colorTag = taste.colorTag;
  if (!space.purpose) space.purpose = taste.purpose || 'home';

  let picks = recommendForSpace(arts, space, arts.length);
  if (taste.genre) {
    const g = picks.filter((p) => p.art.genre === taste.genre);
    if (g.length) picks = g;
  }
  if (taste.sizeClass) {
    const s = picks.filter((p) => p.art.sizeClass === taste.sizeClass);
    if (s.length) picks = s;
  }
  if (budget > 0) {
    const b = picks.filter((p) => p.art.price <= budget);
    if (b.length) picks = b;
  }
  return picks.slice(0, Number(payload.n) || 4);
}

/* ------------------------------------------------------------------ *
 * Real provider — backend proxy (streams text/plain chunks)
 * ------------------------------------------------------------------ */

async function fetchStream(task, payload, onToken) {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, payload })
  });
  if (!res.ok) throw new Error(`AI 서버 오류: ${res.status}`);
  if (!res.body || !res.body.getReader) {
    const text = await res.text();
    if (onToken) onToken(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) { full += chunk; if (onToken) onToken(chunk); }
  }
  return full;
}

/* ------------------------------------------------------------------ *
 * Mock provider — deterministic Korean text, grounded in app data
 * ------------------------------------------------------------------ */

function mockAnswer(task, payload) {
  switch (task) {
    case 'curate': return mockCurate(payload);
    case 'artistNote': return mockArtistNote(payload);
    case 'spaceNarrative': return mockSpaceNarrative(payload);
    default: return 'DEMO 모드: 지원하지 않는 AI 작업입니다.';
  }
}

function mockCurate(payload) {
  const picks = curatePicks(payload);
  const budget = Number(payload.budget) || 0;
  const taste = parseTaste(payload.message || '');
  const withinBudget = budget > 0 && picks.some((p) => p.art.price <= budget);
  const lines = [];

  const wants = [];
  if (taste.colorTag) wants.push(COLOR_LABEL[taste.colorTag] || taste.colorTag);
  if (taste.genre) wants.push(taste.genre);
  if (taste.sizeClass) wants.push(sizeWord(taste.sizeClass));
  if (withinBudget) wants.push(`${won(budget)} 이하`);
  const wantStr = wants.length ? `${wants.join(' · ')} 조건에 맞춰 ` : '';

  lines.push(`요청하신 내용을 살펴봤습니다. ${wantStr}어게인 아트의 실제 등록 작품 중에서 골라봤어요.`);

  if (!picks.length) {
    lines.push('아쉽게도 지금 조건에 딱 맞는 작품을 찾지 못했습니다. 예산을 조금 높이거나 색감·장르 조건을 넓혀보시면 더 많은 후보를 보여드릴 수 있어요.');
    return lines.join('\n\n');
  }

  if (budget > 0 && !withinBudget) {
    lines.push(`말씀하신 ${won(budget)} 이하로는 취향에 맞는 작품이 없어, 예산을 조금 넓혀 가장 가까운 작품들을 골랐습니다.`);
  }

  lines.push(`추천 ${picks.length}점을 매칭도 순으로 소개합니다:`);
  picks.forEach(({ art, score }, i) => {
    const artistName = artistNameOf(art, payload.artists);
    const pct = score ? ` (매칭 ${Math.round(score * 100)}%)` : '';
    const reason = curationReason(art, taste, budget);
    lines.push(`${i + 1}. 「${art.title}」 · ${artistName} — ${art.genre} · ${COLOR_LABEL[art.colorTag] || art.colorTag} · ${art.widthCm}×${art.heightCm}cm · ${won(art.price)}${art.forRent ? ` (대여 ${won(art.rentPricePerMonth)}/월)` : ''}${pct}\n   ${reason}`);
  });

  lines.push('마음에 드는 작품을 눌러 상세 페이지에서 구매 또는 대여를 진행해보세요. (DEMO 모드 — 실제 결제는 이루어지지 않습니다.)');
  return lines.join('\n\n');
}

function curationReason(art, taste, budget) {
  const bits = [];
  if (taste.colorTag && art.colorTag === taste.colorTag) bits.push(`원하시는 ${COLOR_LABEL[art.colorTag]} 색감과 정확히 맞아떨어집니다`);
  else bits.push(`${COLOR_LABEL[art.colorTag] || art.colorTag} 팔레트가 공간에 은은한 분위기를 더합니다`);
  if (taste.genre && art.genre === taste.genre) bits.push(`선호하신 ${art.genre} 장르입니다`);
  if (budget > 0 && art.price <= budget) bits.push('예산 범위 안에서 부담 없이 소장할 수 있습니다');
  if (art.forRent) bits.push('먼저 대여로 걸어두고 반응을 본 뒤 구매를 결정할 수도 있어요');
  return bits.join('. ') + '.';
}

function mockArtistNote(payload) {
  const title = (payload.title || '').trim() || '무제';
  const genre = payload.genre || '작품';
  const medium = payload.medium || '혼합재료';
  const colorLabel = COLOR_LABEL[payload.colorTag] || payload.colorTag || '';
  const comp = COMPOSITION_MOOD[payload.composition] || '화면 전체에 걸친 리듬감';
  const kw = extractKeywords(payload.keywords || payload.note || '');
  const artist = (payload.artistName || '').trim();

  const p1 = `${artist ? `${artist}의 ` : ''}「${title}」은(는) ${medium}(으)로 완성한 ${genre} 작업입니다.` +
    `${colorLabel ? ` ${colorLabel} 팔레트를 중심에 두어, 색이 서로 스며드는 경계에서 화면의 온도가 결정됩니다.` : ''}`;

  const p2 = `구성은 ${comp}을(를) 따릅니다. ${kw.length
    ? `${kw.join(' · ')} 같은 감각을 실마리 삼아, 가까이 다가설수록 손의 흔적과 우연한 번짐이 드러나도록 두었습니다.`
    : '멀리서는 하나의 인상으로, 가까이에서는 무수한 질감의 층으로 읽히도록 의도했습니다.'}`;

  const p3 = '전시가 끝난 뒤 창고에 잠들어 있던 이 작업이, 새로운 벽에서 두 번째 하루를 시작하기를 바랍니다.';

  return [p1, p2, p3].join('\n\n');
}

function mockSpaceNarrative(payload) {
  const art = payload.art || {};
  const space = payload.space || {};
  const purpose = space.purpose || 'home';
  const purposeLabel = PURPOSE_LABEL[purpose] || '공간';
  const prof = PURPOSE_PROFILE[purpose];
  const artistName = artistNameOf(art, payload.artists);
  const colorLabel = COLOR_LABEL[art.colorTag] || art.colorTag || '';
  const scene = PURPOSE_SCENE[purpose] || '이 공간';

  const wallStr = (Number(space.wallWidthCm) > 0 && Number(space.wallHeightCm) > 0)
    ? `${space.wallWidthCm}×${space.wallHeightCm}cm 벽면` : '이 벽면';

  const p1 = `${scene}에 「${art.title || '이 작품'}」(${artistName})을(를) 걸었다고 상상해보세요.` +
    ` ${art.widthCm || '?'}×${art.heightCm || '?'}cm 크기는 ${wallStr}을(를) 비우지도 채우지도 않는 알맞은 여백으로 안아냅니다.`;

  const moodMatch = prof && prof.moods.includes(art.colorTag);
  const p2 = `${colorLabel ? `${colorLabel} 색감은 ` : ''}${moodMatch
    ? `${purposeLabel} 특유의 분위기와 결이 같아, 공간에 들어서는 순간 눈이 자연스럽게 작품에 머뭅니다.`
    : `${purposeLabel}의 기존 톤에 대비를 주어, 밋밋했던 벽을 하나의 초점으로 바꿔놓습니다.`}`;

  const p3 = purpose === 'cafe'
    ? '오래 머무는 손님의 시선이 닿는 자리에 두면, 대화의 실마리가 되고 공간의 인상을 오래 남깁니다.'
    : purpose === 'office'
      ? '집중이 필요한 업무 공간에 과하지 않은 생기를 더해, 방문객에게도 브랜드의 감각을 전합니다.'
      : '매일 지나치는 거실 벽에서, 계절과 빛에 따라 조금씩 다르게 읽히며 일상에 리듬을 만듭니다.';

  return [p1, p2, p3].join('\n\n');
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const COMPOSITION_MOOD = {
  fields: '넓은 색면이 부딪히고 포개지는 구성', strata: '수평의 지층이 쌓여 올라가는 구성',
  orbits: '중심을 도는 궤도들의 구성', grid: '규칙적인 격자 위에 변주를 얹은 구성',
  flow: '흐르는 곡선이 화면을 가로지르는 구성', shards: '조각난 파편이 재조립되는 구성'
};
const PURPOSE_SCENE = {
  cafe: '따뜻한 조명이 흐르는 카페 한쪽 벽', office: '차분한 사무실 로비의 벽',
  home: '햇빛이 드는 거실 소파 위 벽'
};

const TASTE_COLORS = [
  ['웜', 'warm'], ['따뜻', 'warm'], ['warm', 'warm'],
  ['쿨', 'cool'], ['차가', 'cool'], ['cool', 'cool'],
  ['파스텔', 'pastel'], ['pastel', 'pastel'],
  ['비비드', 'vivid'], ['선명', 'vivid'], ['화려', 'vivid'], ['vivid', 'vivid'],
  ['모노', 'monochrome'], ['흑백', 'monochrome'], ['무채', 'monochrome'],
  ['어스', 'earth'], ['흙', 'earth'], ['자연', 'earth'],
  ['뉴트럴', 'neutral'], ['중성', 'neutral']
];
const TASTE_GENRES = [['회화', '회화'], ['그림', '회화'], ['일러스트', '일러스트'], ['판화', '판화'], ['조소', '조소'], ['조각', '조소']];
const TASTE_SIZES = [['소형', 'small'], ['작은', 'small'], ['작품 작', 'small'],
  ['중형', 'medium'], ['중간', 'medium'], ['대형', 'large'], ['큰', 'large'], ['크게', 'large']];
const TASTE_PURPOSE = [['카페', 'cafe'], ['사무실', 'office'], ['오피스', 'office'], ['집', 'home'], ['거실', 'home'], ['가정', 'home']];

function parseTaste(message) {
  const m = String(message || '').toLowerCase();
  const find = (pairs) => { for (const [k, v] of pairs) if (m.includes(k.toLowerCase())) return v; return ''; };
  return {
    colorTag: find(TASTE_COLORS),
    genre: find(TASTE_GENRES),
    sizeClass: find(TASTE_SIZES),
    purpose: find(TASTE_PURPOSE)
  };
}

function extractKeywords(text) {
  return String(text || '')
    .split(/[,\s·、]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 3);
}

const sizeWord = (s) => ({ small: '소형', medium: '중형', large: '대형' }[s] || s);

function artistNameOf(art, artists) {
  if (art && art.artistName) return art.artistName;
  if (Array.isArray(artists) && art) {
    const a = artists.find((x) => x.id === art.artistId);
    if (a) return a.name;
  }
  return '작가 미상';
}

// Simulate a token stream from a finished string so the mock feels live in the UI.
async function streamOut(text, onToken) {
  if (!onToken) return text;
  const units = Array.from(text);
  const CHUNK = 3;
  for (let i = 0; i < units.length; i += CHUNK) {
    onToken(units.slice(i, i + CHUNK).join(''));
    // small yield so the browser paints between chunks (no-op cost under node --check)
    await new Promise((r) => setTimeout(r, 12));
  }
  return text;
}

export default askAI;
