// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// recommend.js — space-matching recommender. Pure functions (no DOM, no storage) so
// they run identically in the browser and under `node check.mjs` unit tests.

// A "space" describes where the art will hang:
//   { wallWidthCm, wallHeightCm, colorTag, purpose }
//   purpose ∈ 'cafe' | 'office' | 'home'
// Each purpose nudges preferred size / mood.
export const PURPOSE_PROFILE = {
  cafe:   { label: '카페', sizeBias: 'large',  moods: ['warm', 'vivid', 'earth'] },
  office: { label: '사무실', sizeBias: 'medium', moods: ['cool', 'monochrome', 'neutral'] },
  home:   { label: '가정/거실', sizeBias: 'medium', moods: ['pastel', 'earth', 'warm'] }
};

// How well does an artwork physically fit the wall? 1 = ideal, 0 = will not fit.
// Ideal art occupies ~50–70% of the wall's limiting dimension.
export function sizeFitScore(art, space) {
  const ww = Number(space.wallWidthCm) || 0;
  const wh = Number(space.wallHeightCm) || 0;
  if (ww <= 0 || wh <= 0) return 0.5; // no wall given → neutral
  if (art.widthCm > ww || art.heightCm > wh) return 0; // physically too big
  const ratio = Math.max(art.widthCm / ww, art.heightCm / wh); // occupancy of limiting side
  const ideal = 0.6;
  // triangular falloff around the ideal occupancy
  const score = 1 - Math.min(1, Math.abs(ratio - ideal) / ideal);
  return Math.max(0, score);
}

// Colour agreement: exact tag match is best, related warm/cool families get partial credit.
const RELATED = {
  warm: ['earth', 'vivid'], earth: ['warm', 'neutral'], vivid: ['warm', 'cool'],
  cool: ['monochrome', 'pastel'], pastel: ['cool', 'neutral'],
  monochrome: ['cool', 'neutral'], neutral: ['earth', 'monochrome']
};
export function colorScore(art, space) {
  if (!space.colorTag) return 0.5;
  if (art.colorTag === space.colorTag) return 1;
  if ((RELATED[space.colorTag] || []).includes(art.colorTag)) return 0.6;
  return 0.15;
}

// Purpose mood/size agreement.
export function purposeScore(art, space) {
  const prof = PURPOSE_PROFILE[space.purpose];
  if (!prof) return 0.5;
  let s = 0.4;
  if (prof.moods.includes(art.colorTag)) s += 0.35;
  if (art.sizeClass === prof.sizeBias) s += 0.25;
  return Math.min(1, s);
}

// Weighted total in [0,1]. A non-fitting piece is hard-zeroed.
export function scoreArtworkForSpace(art, space) {
  const fit = sizeFitScore(art, space);
  if (fit === 0) return 0;
  const color = colorScore(art, space);
  const purpose = purposeScore(art, space);
  return +(fit * 0.5 + color * 0.3 + purpose * 0.2).toFixed(4);
}

// Rank artworks for a space, dropping non-fitting pieces, returning the top n with scores.
export function recommendForSpace(artworks, space, n = 6) {
  return artworks
    .map((art) => ({ art, score: scoreArtworkForSpace(art, space) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export default recommendForSpace;
