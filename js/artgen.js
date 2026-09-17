// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// artgen.js — procedural abstract art. Given an artwork's {seed, colors, composition}
// it deterministically renders an inline SVG so the gallery looks real with zero binaries.

// Deterministic PRNG (mulberry32) — same seed always yields the same picture.
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const rr = (r, lo, hi) => lo + r() * (hi - lo);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Each composition draws a distinct abstract style using the palette colors.
const COMPOSERS = {
  fields(r, W, H, colors) {
    // soft overlapping color fields
    let s = `<rect width="${W}" height="${H}" fill="${colors[0]}"/>`;
    const n = 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const cx = rr(r, 0, W), cy = rr(r, 0, H), rad = rr(r, W * 0.2, W * 0.55);
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${pick(r, colors)}" opacity="${rr(r, 0.35, 0.7).toFixed(2)}"/>`;
    }
    return s;
  },
  strata(r, W, H, colors) {
    // horizontal geological bands
    let s = `<rect width="${W}" height="${H}" fill="${colors[colors.length - 1]}"/>`;
    let y = 0;
    while (y < H) {
      const band = rr(r, H * 0.06, H * 0.2);
      s += `<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${(band + 1).toFixed(1)}" fill="${pick(r, colors)}" opacity="${rr(r, 0.75, 1).toFixed(2)}"/>`;
      y += band;
    }
    return s;
  },
  orbits(r, W, H, colors) {
    // concentric rings around a shifted center
    let s = `<rect width="${W}" height="${H}" fill="${colors[0]}"/>`;
    const cx = rr(r, W * 0.3, W * 0.7), cy = rr(r, H * 0.3, H * 0.7);
    const n = 6 + Math.floor(r() * 5);
    for (let i = n; i > 0; i--) {
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(i / n * W * 0.6).toFixed(1)}" fill="none" stroke="${pick(r, colors)}" stroke-width="${rr(r, 3, 14).toFixed(1)}" opacity="${rr(r, 0.5, 0.9).toFixed(2)}"/>`;
    }
    return s;
  },
  grid(r, W, H, colors) {
    // modular color grid with gaps
    let s = `<rect width="${W}" height="${H}" fill="${colors[colors.length - 1]}"/>`;
    const cols = 3 + Math.floor(r() * 3), rows = 3 + Math.floor(r() * 3);
    const cw = W / cols, ch = H / rows, g = Math.min(cw, ch) * 0.12;
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
      if (r() < 0.15) continue;
      s += `<rect x="${(x * cw + g).toFixed(1)}" y="${(y * ch + g).toFixed(1)}" width="${(cw - 2 * g).toFixed(1)}" height="${(ch - 2 * g).toFixed(1)}" rx="${(g * 0.5).toFixed(1)}" fill="${pick(r, colors)}" opacity="${rr(r, 0.7, 1).toFixed(2)}"/>`;
    }
    return s;
  },
  flow(r, W, H, colors) {
    // flowing bezier ribbons
    let s = `<rect width="${W}" height="${H}" fill="${colors[0]}"/>`;
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const y0 = rr(r, 0, H);
      const d = `M ${(-W * 0.1).toFixed(1)} ${y0.toFixed(1)} C ${(W * 0.3).toFixed(1)} ${rr(r, 0, H).toFixed(1)}, ${(W * 0.7).toFixed(1)} ${rr(r, 0, H).toFixed(1)}, ${(W * 1.1).toFixed(1)} ${rr(r, 0, H).toFixed(1)}`;
      s += `<path d="${d}" fill="none" stroke="${pick(r, colors)}" stroke-width="${rr(r, 6, 26).toFixed(1)}" stroke-linecap="round" opacity="${rr(r, 0.45, 0.85).toFixed(2)}"/>`;
    }
    return s;
  },
  shards(r, W, H, colors) {
    // angular overlapping triangles
    let s = `<rect width="${W}" height="${H}" fill="${colors[colors.length - 1]}"/>`;
    const n = 7 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const p = [];
      for (let k = 0; k < 3; k++) p.push(`${rr(r, 0, W).toFixed(1)},${rr(r, 0, H).toFixed(1)}`);
      s += `<polygon points="${p.join(' ')}" fill="${pick(r, colors)}" opacity="${rr(r, 0.4, 0.8).toFixed(2)}"/>`;
    }
    return s;
  }
};

// Build a full SVG string for an artwork.
export function artSVG(art, opts = {}) {
  const W = opts.width || 600;
  const H = opts.height || Math.round(W * ((art.heightCm || 100) / (art.widthCm || 100)));
  const colors = (art.colors && art.colors.length ? art.colors : ['#888', '#ccc', '#555', '#eee']);
  const composer = COMPOSERS[art.composition] || COMPOSERS.fields;
  const r = rng(art.seed || 1);
  const inner = composer(r, W, H, colors);
  // subtle vignette + grain for a painterly finish
  const gid = `g${art.seed || 1}`;
  const defs = `<defs><radialGradient id="${gid}" cx="50%" cy="45%" r="75%">` +
    `<stop offset="60%" stop-color="#000" stop-opacity="0"/>` +
    `<stop offset="100%" stop-color="#000" stop-opacity="0.22"/></radialGradient></defs>`;
  const label = art.title ? `<title>${esc(art.title)}</title>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(art.title || 'artwork')}" preserveAspectRatio="xMidYMid slice">${label}${defs}${inner}<rect width="${W}" height="${H}" fill="url(#${gid})"/></svg>`;
}

export default artSVG;
