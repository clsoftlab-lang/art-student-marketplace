// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — minimal, cost-efficient backend proxy for the Again Art AI layer.
//
// It exposes a single endpoint, POST /api/ai, that the browser calls with {task, payload}.
// The Anthropic API key is read from process.env.ANTHROPIC_API_KEY and NEVER sent to the
// browser. Claude's response is streamed back to the client as text/plain chunks, which is
// exactly what ai/ai.js's fetchStream() reads.
//
// Cost model (무인·저비용):
//   • Cost-first default model: claude-haiku-4-5 ($1 / $5 per MTok). Configurable via AI_MODEL.
//   • Prompt caching on the stable per-task system prompt (cache reads cost less on repeats).
//   • Modest per-task max_tokens caps.
//   • Per-IP rate limit + a monthly token budget → HTTP 429 {fallback:true} when exceeded,
//     and ai/ai.js then auto-falls back to the offline mock so the app never breaks.
//
// Run:  ANTHROPIC_API_KEY=sk-ant-... node server/index.mjs
// Then set AI_ENDPOINT in ai/config.js to e.g. "http://localhost:8787/api/ai".

import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT) || 8787;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Cost-first default. AI_MODEL may be raised to 'claude-sonnet-5' or 'claude-opus-5' for
// higher quality (at higher cost). Haiku 4.5 is the cheapest capable option and the default.
const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
const IS_HAIKU = MODEL.startsWith('claude-haiku');
const EFFORT = process.env.AI_EFFORT || 'low';

// Monthly token budget guardrail. Default 2,000,000 tokens/month across all callers.
const MONTHLY_TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP) || 2_000_000;
const RATE_LIMIT_PER_MIN = Number(process.env.AI_RATE_LIMIT_PER_MIN) || 20;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

/* ---------- prompt construction (grounded in the payload the browser sends) ---------- */

const BASE_SYSTEM =
  '당신은 "어게인 아트(Again Art)"의 큐레이터 AI입니다. 어게인 아트는 미술대학생의 졸업 작품을 ' +
  '갤러리·카페·사무실·개인에게 구매 또는 대여로 다시 잇는 마켓플레이스입니다. 항상 한국어로, ' +
  '따뜻하고 전문적인 큐레이터의 어조로 답합니다. 반드시 payload에 주어진 실제 작품·작가 데이터에만 ' +
  '근거하여 답하고, 존재하지 않는 작품이나 가격을 지어내지 마세요. 이 서비스는 DEMO 모드이며 실제 ' +
  '결제는 없다는 점을 자연스럽게 안내합니다.';

// Modest, per-task output caps. Default ~700; raised only where a task truly needs more room.
const MAX_TOKENS = { curate: 1000, artistNote: 700, spaceNarrative: 700, spaceDigest: 400 };
const maxTokensFor = (task) => MAX_TOKENS[task] || 700;

function buildPrompt(task, payload) {
  const data = JSON.stringify(payload ?? {}, null, 0);
  switch (task) {
    case 'curate':
      return {
        system: BASE_SYSTEM,
        user:
          '사용자의 공간·취향·예산 요청에 맞춰 payload.artworks 중에서 어울리는 작품을 매칭도 순으로 ' +
          '추천하고, 각 작품마다 제목·작가·장르·색감·크기·가격과 추천 이유를 한 문단으로 설명하세요.\n\n' +
          `요청: ${JSON.stringify(payload?.message ?? '')}\n예산: ${JSON.stringify(payload?.budget ?? '')}\n` +
          `공간: ${JSON.stringify(payload?.space ?? {})}\n\n데이터(payload): ${data}`
      };
    case 'artistNote':
      return {
        system: BASE_SYSTEM,
        user:
          '아래 작품 정보를 바탕으로 세 문단 분량의 자연스러운 한국어 작가노트/작품 설명을 작성하세요. ' +
          '재료·색감·구성·주제를 녹여내되 과장 없이 진솔하게 쓰세요.\n\n' + `작품 정보: ${data}`
      };
    case 'spaceNarrative':
      return {
        system: BASE_SYSTEM,
        user:
          'payload.art 작품이 payload.space(카페/사무실/가정)에 왜 잘 어울리는지, 실제로 벽에 걸린 장면을 ' +
          '떠올리게 하는 세 문단의 서술형 한국어 설명을 작성하세요. 크기 적합성과 색감·분위기를 근거로 삼으세요.\n\n' +
          `데이터(payload): ${data}`
      };
    case 'spaceDigest':
      return {
        system: BASE_SYSTEM,
        user:
          '아래 payload.picks는 공간 매칭 추천기가 payload.space에 맞춰 이미 골라둔 오늘의 추천 작품 목록입니다. ' +
          '가장 매칭도 높은 1~2점을 중심으로, 왜 이 공간에 잘 어울리는지 두세 문장으로 짧고 따뜻하게 요약하세요. ' +
          '목록에 없는 작품은 지어내지 마세요.\n\n' + `데이터(payload): ${data}`
      };
    default:
      return { system: BASE_SYSTEM, user: `다음 요청을 한국어로 도와주세요.\n\n${data}` };
  }
}

/* ---------- cost guardrails: monthly token budget + per-IP rate limit ---------- */

// Monthly token budget, reset when the calendar month rolls over.
let budget = { month: monthKey(), used: 0 };
function monthKey() { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth()}`; }
function budgetExceeded() {
  const m = monthKey();
  if (m !== budget.month) budget = { month: m, used: 0 };
  return budget.used >= MONTHLY_TOKEN_CAP;
}
function addUsage(usage) {
  if (!usage) return;
  const t = (usage.input_tokens || 0) + (usage.output_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  budget.used += t;
}

// Simple in-memory per-IP sliding-window rate limit (default 20 requests / minute).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= RATE_LIMIT_PER_MIN) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  return false;
}

/* ---------- HTTP server ---------- */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error('payload too large')); // 1MB guard
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function send429Fallback(res) {
  res.writeHead(429, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ fallback: true })); // ai/ai.js falls back to the offline mock
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: MODEL, monthlyTokenCap: MONTHLY_TOKEN_CAP, tokensUsed: budget.used }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/ai') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  // Cost guardrails — refuse (with a fallback signal) before spending any tokens.
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) { send429Fallback(res); return; }
  if (budgetExceeded()) { send429Fallback(res); return; }

  try {
    const { task, payload } = JSON.parse((await readBody(req)) || '{}');
    if (!task) throw new Error('missing task');
    const { system, user } = buildPrompt(task, payload);

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked'
    });

    const params = {
      model: MODEL,
      max_tokens: maxTokensFor(task),
      // Prompt caching: the stable per-task system prompt is a cacheable block so repeated
      // calls read the cache and cost less. The volatile payload stays in the user message.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }]
    };
    // Haiku 4.5 does not accept adaptive thinking / effort (would 400) — send neither.
    // For Sonnet/Opus, enable adaptive thinking + a cost-first effort level.
    if (!IS_HAIKU) {
      params.thinking = { type: 'adaptive' };
      params.output_config = { effort: EFFORT };
    }

    const stream = client.messages.stream(params);
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(event.delta.text);
      }
    }
    // Accumulate real token usage into the monthly budget from the final message.
    try { const final = await stream.finalMessage(); addUsage(final && final.usage); } catch { /* ignore */ }
    res.end();
  } catch (err) {
    console.error('AI request failed:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err && err.message || err) }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Again Art AI proxy listening on http://localhost:${PORT}`);
  console.log(`  POST /api/ai   (model: ${MODEL}${IS_HAIKU ? '' : `, effort: ${EFFORT}`})`);
  console.log(`  cost guardrails: ${RATE_LIMIT_PER_MIN}/min per IP, ${MONTHLY_TOKEN_CAP.toLocaleString()} tokens/month`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ⚠  ANTHROPIC_API_KEY is not set — real AI calls will fail until you set it.');
  }
});
