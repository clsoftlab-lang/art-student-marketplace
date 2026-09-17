// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// data.js — loads seed JSON, merges localStorage submissions, exposes lookups + filtering.

import { getSubmissions } from './storage.js';

let _artworks = [];
let _artists = [];
let _byId = new Map();
let _artistById = new Map();

export async function loadData() {
  const [aw, ar] = await Promise.all([
    fetch('./data/artworks.json').then((r) => r.json()),
    fetch('./data/artists.json').then((r) => r.json())
  ]);
  _artists = ar;
  _artistById = new Map(_artists.map((a) => [a.id, a]));
  refresh(aw);
  return { artworks: _artworks, artists: _artists };
}

// Re-merge seed + user submissions (call after a new consignment is added).
export function refresh(seedArtworks) {
  if (seedArtworks) refresh._seed = seedArtworks;
  const seed = refresh._seed || [];
  const subs = getSubmissions();
  _artworks = [...subs, ...seed];
  _byId = new Map(_artworks.map((a) => [a.id, a]));
  return _artworks;
}

export const allArtworks = () => _artworks;
export const allArtists = () => _artists;
export const getArtwork = (id) => _byId.get(id);
export const getArtist = (id) => _artistById.get(id);
export const artworksByArtist = (artistId) => _artworks.filter((a) => a.artistId === artistId);

export const GENRES = ['회화', '일러스트', '판화', '조소'];
export const COLOR_TAGS = [
  { tag: 'warm', label: '웜톤' }, { tag: 'cool', label: '쿨톤' },
  { tag: 'pastel', label: '파스텔' }, { tag: 'vivid', label: '비비드' },
  { tag: 'monochrome', label: '모노톤' }, { tag: 'earth', label: '어스톤' },
  { tag: 'neutral', label: '뉴트럴' }
];
export const SIZE_CLASSES = [
  { v: 'small', label: '소형 (~40cm)' },
  { v: 'medium', label: '중형 (40–80cm)' },
  { v: 'large', label: '대형 (80cm~)' }
];

// Filter + sort. `f` = { q, genre, colorTag, sizeClass, availability, maxPrice }
export function queryArtworks(f = {}) {
  let list = _artworks.slice();
  const q = (f.q || '').trim().toLowerCase();
  if (q) {
    list = list.filter((a) => {
      const artist = _artistById.get(a.artistId);
      return (a.title || '').toLowerCase().includes(q) ||
        (a.medium || '').toLowerCase().includes(q) ||
        (a.paletteName || '').toLowerCase().includes(q) ||
        (artist && artist.name.toLowerCase().includes(q));
    });
  }
  if (f.genre) list = list.filter((a) => a.genre === f.genre);
  if (f.colorTag) list = list.filter((a) => a.colorTag === f.colorTag);
  if (f.sizeClass) list = list.filter((a) => a.sizeClass === f.sizeClass);
  if (f.availability === 'rent') list = list.filter((a) => a.forRent);
  if (f.availability === 'buy') list = list.filter((a) => a.price > 0);
  if (f.maxPrice) list = list.filter((a) => a.price <= f.maxPrice);

  switch (f.sort) {
    case 'price-asc': list.sort((a, b) => a.price - b.price); break;
    case 'price-desc': list.sort((a, b) => b.price - a.price); break;
    case 'size-desc': list.sort((a, b) => (b.widthCm * b.heightCm) - (a.widthCm * a.heightCm)); break;
    case 'title': list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko')); break;
    default: /* newest: submissions first, keep order */ break;
  }
  return list;
}
