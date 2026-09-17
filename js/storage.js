// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// storage.js — thin localStorage wrapper. Every access is wrapped in try/catch so the
// app keeps working in private windows or when storage is blocked (DEMO mode only).

const NS = 'againart.v1.';
const memoryFallback = new Map(); // used when localStorage throws

function safeGet(key) {
  try {
    const v = localStorage.getItem(NS + key);
    return v === null ? (memoryFallback.has(key) ? memoryFallback.get(key) : null) : v;
  } catch {
    return memoryFallback.has(key) ? memoryFallback.get(key) : null;
  }
}
function safeSet(key, value) {
  memoryFallback.set(key, value);
  try { localStorage.setItem(NS + key, value); } catch { /* ignore: memory fallback holds it */ }
}

export function readJSON(key, fallback) {
  const raw = safeGet(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
export function writeJSON(key, value) {
  try { safeSet(key, JSON.stringify(value)); return true; } catch { return false; }
}

// Wishlist: array of artwork ids
export const getWishlist = () => readJSON('wishlist', []);
export function toggleWishlist(id) {
  const w = new Set(getWishlist());
  if (w.has(id)) w.delete(id); else w.add(id);
  writeJSON('wishlist', [...w]);
  return w.has(id);
}
export const inWishlist = (id) => getWishlist().includes(id);

// Cart: array of { id, mode:'buy'|'rent', months }
export const getCart = () => readJSON('cart', []);
export function addToCart(entry) {
  const cart = getCart();
  const i = cart.findIndex((c) => c.id === entry.id && c.mode === entry.mode);
  if (i >= 0) cart[i] = { ...cart[i], ...entry }; else cart.push(entry);
  writeJSON('cart', cart);
  return cart;
}
export function removeFromCart(id, mode) {
  const cart = getCart().filter((c) => !(c.id === id && c.mode === mode));
  writeJSON('cart', cart);
  return cart;
}
export function clearCart() { writeJSON('cart', []); }

// Consignment submissions (artist-uploaded works)
export const getSubmissions = () => readJSON('submissions', []);
export function addSubmission(sub) {
  const list = getSubmissions();
  list.unshift(sub);
  writeJSON('submissions', list);
  return list;
}

// Order history (simulated checkouts)
export const getOrders = () => readJSON('orders', []);
export function addOrder(order) {
  const list = getOrders();
  list.unshift(order);
  writeJSON('orders', list);
  return list;
}

// Theme
export const getTheme = () => safeGet('theme') || '';
export const setTheme = (t) => safeSet('theme', t);

// Full reset — wipes every key in the namespace.
export function resetAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  memoryFallback.clear();
}
