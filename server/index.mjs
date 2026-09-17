// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — minimal backend proxy for the Again Art AI layer.
//
// It exposes a single endpoint, POST /api/ai, that the browser calls with {task, payload}.
// The Anthropic API key is read from process.env.ANTHROPIC_API_KEY and NEVER sent to the
// browser. Claude's response is streamed back to the client as text/plain chunks, which is
// exactly what ai/ai.js's fetchStream() reads.
//
// Run:  ANTHROPIC_API_KEY=sk-ant-... node server/index.mjs
// Then set AI_ENDPOINT in ai/config.js to e.g. "http://localhost:8787/api/ai".

import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT) || 8787;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MODEL = 'claude-opus-5';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

/* ---------- prompt construction (grounded in the payload the browser sends) ---------- */

const BASE_SYSTEM =
  '당신은 "어게인 아트(Again Art)"의 큐레이터 AI입니다. 어게인 아트는 미술대학생의 졸업 작품을 ' +
  '갤러리·카페·사무실·개인에게 구매 또는 대여로 다시 잇는 마켓플레이스입니다. 항상 한국어로, ' +
  '따뜻하고 전문적인 큐레이터의 어조로 답합니다. 반드시 payload에 주어진 실제 작품·작가 데이터에만 ' +
  '근거하여 답하고, 존재하지 않는 작품이나 가격을 지어내지 마세요. 이 서비스는 DEMO 모드이며 실제 ' +
  '결제는 없다는 점을 자연스럽게 안내합니다.';

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
    default:
      return { system: BASE_SYSTEM, user: `다음 요청을 한국어로 도와주세요.\n\n${data}` };
  }
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

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: MODEL }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/ai') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  try {
    const { task, payload } = JSON.parse((await readBody(req)) || '{}');
    if (!task) throw new Error('missing task');
    const { system, user } = buildPrompt(task, payload);

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked'
    });

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: user }]
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(event.delta.text);
      }
    }
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
  console.log(`  POST /api/ai   (model: ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ⚠  ANTHROPIC_API_KEY is not set — real AI calls will fail until you set it.');
  }
});
