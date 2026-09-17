// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/config.js — AI layer configuration.
//
// AI_ENDPOINT controls where askAI() sends requests:
//   ""  (empty)  → DEMO mode. A deterministic, offline Korean MockProvider answers,
//                  reusing the app's own artworks/artists data + the space-match recommender.
//                  No network, no API key, nothing leaves the browser.
//   "https://…"  → REAL mode. POST {task, payload} to that endpoint (your own backend
//                  proxy in server/), which holds the ANTHROPIC_API_KEY server-side and
//                  streams Claude's response back.
//
// SECURITY: never place an Anthropic API key here or anywhere else in the browser/repo.
// The key lives ONLY on the server (server/.env → process.env.ANTHROPIC_API_KEY).
export const AI_ENDPOINT = "";
