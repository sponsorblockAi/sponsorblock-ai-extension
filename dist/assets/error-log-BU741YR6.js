const s = {
    MAX_TRANSCRIPT_LENGTH: 32e3,
    TEMPERATURE: 0.1,
    MAX_TOKENS: 16384,
    FETCH_TIMEOUT_MS: 3e4,
    MAX_NETWORK_RETRIES: 2,
    NETWORK_RETRY_BASE_DELAY_MS: 1e3,
  },
  c = {
    API_BASE: 'https://sponsor.ajay.app/api',
    RATE_LIMIT_PER_MINUTE: 25,
    RATE_WINDOW_MS: 6e4,
    MAX_RATE_LIMIT_RETRIES: 2,
    CACHE_TTL_MS: 24 * 60 * 60 * 1e3,
    CACHE_PRUNE_AGE_MS: 7 * 24 * 60 * 60 * 1e3,
  },
  a = { MAX_ENTRIES: 50 };
function _(o, e) {
  return chrome.i18n.getMessage(o, e) || `[${o}]`;
}
const t = 'sbai_error_log';
async function n(o, e = '') {
  try {
    const r = (await chrome.storage.local.get(t))[t] ?? [];
    for (r.push({ timestamp: Date.now(), message: o, detail: e }); r.length > a.MAX_ENTRIES; )
      r.shift();
    await chrome.storage.local.set({ [t]: r });
  } catch {}
}
async function T() {
  try {
    return [...((await chrome.storage.local.get(t))[t] ?? [])].reverse();
  } catch {
    return [];
  }
}
async function R() {
  try {
    await chrome.storage.local.remove(t);
  } catch {}
}
export { s as L, c as S, R as c, T as g, n as l, _ as t };
