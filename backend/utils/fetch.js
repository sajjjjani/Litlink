/**
 * Safe `fetch` for Node backends.
 *
 * Why: `node-fetch@3` is ESM-only. Using `require('node-fetch')` in CommonJS
 * returns an object, which causes runtime errors like "fetch is not a function".
 *
 * This wrapper prefers Node's built-in `globalThis.fetch` (Node 18+),
 * and falls back to a cached dynamic import of `node-fetch` when needed.
 */
let cachedFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : null;

async function fetchWithFallback(...args) {
  if (cachedFetch) return cachedFetch(...args);

  // Dynamic import (works in CommonJS) and cache it
  const mod = await import('node-fetch');
  cachedFetch = mod.default;
  return cachedFetch(...args);
}

module.exports = fetchWithFallback;

