// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/worker.js — Cloudflare Workers variant of the Again Art AI proxy (무인/serverless).
//
// Same endpoint contract as server/index.mjs: POST /api/ai with {task, payload}, returns the
// assistant text as text/plain (no server to babysit — free tier, one deploy). It calls the
// Anthropic REST API directly so it needs no npm dependency.
//
//   • Model cost-first default: claude-haiku-4-5. Configurable via the AI_MODEL var.
//     May be raised to claude-sonnet-5 or claude-opus-5 for higher quality.
//   • Prompt caching on the stable per-task system prompt (cheaper repeats).
//   • Haiku 4.5 gets NO thinking / effort; Sonnet/Opus get adaptive thinking + effort.
//   • Modest per-task max_tokens caps.
//
// SECURITY: the key lives ONLY in the Worker secret ANTHROPIC_API_KEY (wrangler secret put),
// never in this file, the browser, or the repo.
//
// Deploy:  cd server && npx wrangler deploy
//          npx wrangler secret put ANTHROPIC_API_KEY
// Then set AI_ENDPOINT in ai/config.js to the Worker URL + "/api/ai".

const BASE_SYSTEM =
  '당신은 "어게인 아트(Again Art)"의 큐레이터 AI입니다. 어게인 아트는 미술대학생의 졸업 작품을 ' +
  '갤러리·카페·사무실·개인에게 구매 또는 대여로 다시 잇는 마켓플레이스입니다. 항상 한국어로, ' +
  '따뜻하고 전문적인 큐레이터의 어조로 답합니다. 반드시 payload에 주어진 실제 작품·작가 데이터에만 ' +
  '근거하여 답하고, 존재하지 않는 작품이나 가격을 지어내지 마세요. 이 서비스는 DEMO 모드이며 실제 ' +
  '결제는 없다는 점을 자연스럽게 안내합니다.';

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const model = env.AI_MODEL || 'claude-haiku-4-5';
      return Response.json({ ok: true, model }, { headers: CORS });
    }
    if (request.method !== 'POST' || url.pathname !== '/api/ai') {
      return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
    }
    if (!env.ANTHROPIC_API_KEY) {
      // No key configured → signal fallback so the app keeps working on the mock (무인).
      return Response.json({ fallback: true }, { status: 429, headers: CORS });
    }

    try {
      const { task, payload } = await request.json();
      if (!task) throw new Error('missing task');
      const { system, user } = buildPrompt(task, payload);

      const model = env.AI_MODEL || 'claude-haiku-4-5';
      const isHaiku = model.startsWith('claude-haiku');
      const body = {
        model,
        max_tokens: maxTokensFor(task),
        // Prompt caching on the stable system prompt; volatile payload stays in the user turn.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }]
      };
      if (!isHaiku) {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: env.AI_EFFORT || 'low' };
      }

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!upstream.ok) {
        // Anthropic error (rate limit, overload, etc.) → tell the client to fall back.
        return Response.json({ fallback: true }, { status: 429, headers: CORS });
      }
      const data = await upstream.json();
      const text = (Array.isArray(data.content) ? data.content : [])
        .filter((b) => b.type === 'text').map((b) => b.text).join('');
      return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });
    } catch (err) {
      return Response.json({ fallback: true, error: String(err && err.message || err) }, { status: 429, headers: CORS });
    }
  }
};
