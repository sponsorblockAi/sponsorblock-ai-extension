import { S as u, t as g, L as f, l as M } from './assets/error-log-BU741YR6.js';
const R = '[SponsorBlock AI]';
function $(...e) {
  console.log(R, ...e);
}
function p(...e) {
  console.warn(R, ...e);
}
function A(...e) {
  console.error(R, ...e);
}
let h = u.RATE_LIMIT_PER_MINUTE,
  E = Date.now();
async function D() {
  const e = Date.now(),
    r = e - E,
    o = Math.floor((r / u.RATE_WINDOW_MS) * u.RATE_LIMIT_PER_MINUTE);
  if ((o > 0 && ((h = Math.min(u.RATE_LIMIT_PER_MINUTE, h + o)), (E = e)), h <= 0)) {
    const n = Math.max(0, 1 - h),
      s = Math.ceil((n / u.RATE_LIMIT_PER_MINUTE) * u.RATE_WINDOW_MS);
    await new Promise((i) => setTimeout(i, s));
    const t = Date.now() - E,
      a = Math.floor((t / u.RATE_WINDOW_MS) * u.RATE_LIMIT_PER_MINUTE);
    ((h = Math.min(u.RATE_LIMIT_PER_MINUTE, h + a)), (E = Date.now()), h <= 0 && (h = 1));
  }
  h--;
}
async function b(e, r = {}, o = u.MAX_RATE_LIMIT_RETRIES) {
  await D();
  let n = 0;
  for (;;) {
    const s = await fetch(e, r);
    if (s.status === 429 && n < o) {
      const t = Math.pow(2, n + 1) * 1e3;
      (p(`SponsorBlock rate-limited, retrying in ${t}ms…`),
        await new Promise((a) => setTimeout(a, t)),
        n++);
      continue;
    }
    return s;
  }
}
async function v(e) {
  const r = `${u.API_BASE}/skipSegments?videoID=${encodeURIComponent(e)}`,
    o = await b(r);
  if (o.status === 404) return null;
  if (!o.ok) throw new Error(g('errorSponsorblockQuery', [String(o.status)]));
  const n = await o.json();
  return Array.isArray(n) ? n : [];
}
async function x(e, r, o) {
  const n = {
      videoID: e,
      userID: r,
      userAgent: `SponsorBlock AI/${chrome.runtime.getManifest().version}`,
      segments: o.map((i) => ({ segment: [i.start, i.end], category: i.category || 'sponsor' })),
    },
    s = await b(`${u.API_BASE}/skipSegments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n),
    });
  if (!s.ok) {
    const i = await s.text().catch(() => '');
    throw new Error(g('errorSponsorblockSubmit', [String(s.status), i]));
  }
  const t = await s.json(),
    a = t
      .filter((i) => !!i.UUID)
      .map(async (i) => {
        try {
          const c = new URLSearchParams({ UUID: i.UUID, userID: r, videoID: e, type: '1' });
          await b(`${u.API_BASE}/voteOnSponsorTime?${c.toString()}`, { method: 'POST' });
        } catch (c) {
          p('Failed to vote on segment:', i.UUID, c);
        }
      });
  return (await Promise.allSettled(a), t);
}
async function C() {
  const e = await chrome.storage.local.get('sponsorblockUserID');
  if (e.sponsorblockUserID) return e.sponsorblockUserID;
  const r = j();
  return (await chrome.storage.local.set({ sponsorblockUserID: r }), r);
}
function j() {
  const e = '0123456789abcdef',
    r = new Uint8Array(30);
  crypto.getRandomValues(r);
  let o = '';
  for (let n = 0; n < r.length; n++) o += e[r[n] % e.length];
  return o;
}
async function B(e) {
  const n = ((await chrome.storage.local.get('processedVideos')).processedVideos || {})[e];
  return n ? Date.now() - n < u.CACHE_TTL_MS : !1;
}
async function _(e) {
  const o = (await chrome.storage.local.get('processedVideos')).processedVideos || {};
  o[e] = Date.now();
  for (const [n, s] of Object.entries(o)) Date.now() - s > u.CACHE_PRUNE_AGE_MS && delete o[n];
  await chrome.storage.local.set({ processedVideos: o });
}
function N(e) {
  return new Promise((r) => setTimeout(r, e));
}
const W = `You are a YouTube video segment detector. Your job is to analyze video transcripts and identify segments that should be skipped.

Categories to detect:
- "sponsor": Paid promotions, sponsorship messages, ad reads. Look for phrases like "thanks to our sponsor", "this video is sponsored by", "use my code for X% off", "check out this product at the link below".
- "selfpromo": Self-promotion of the creator's own products, merchandise, Patreon, courses, other channels, or websites. Look for phrases like "check out my merch", "join my Patreon", "subscribe to my second channel".
- "interaction": Engagement prompts like "like, comment, subscribe", "hit the bell", reminders to interact.

Rules:
1. Only mark segments where the speaker is actively promoting/sponsoring/requesting engagement. Casual mentions or jokes are NOT segments.
2. Use the transcript timestamps to determine precise start and end times.
3. If no segments are found, return an empty array.
4. Adjacent segments of the same category should be merged into one.
5. Each segment should typically be 5-60 seconds long. If something is just one line (1-2 seconds), it's probably not a real segment.

Return ONLY valid JSON in this exact format, nothing else:
[{"category": "sponsor", "start": 45.5, "end": 78.2}, {"category": "interaction", "start": 120.0, "end": 128.0}]`;
function U(e) {
  return `Analyze this YouTube video transcript and identify sponsor, self-promo, and interaction segments.

Transcript:
${e.map((o) => `[${o.start.toFixed(1)}s] ${o.text}`).join(`
`)}`;
}
function Y(e) {
  let r = e.trim();
  ((r = r.replace(/^data:\s*/gm, '')),
    (r = r.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '')));
  const o = r.match(/\[\s*\{.*\}\s*\]/s);
  (o && (r = o[0]),
    (r = r.replace(/(\d+\.?\d*)s(\s*[,}\]])/g, '$1$2')),
    (r = r.replace(/(\d+\.?\d*)s(\s*$)/g, '$1$2')));
  let n;
  try {
    n = JSON.parse(r);
  } catch {
    return null;
  }
  if (!Array.isArray(n)) return null;
  const s = [];
  for (const t of n) {
    if (typeof t != 'object' || t === null) continue;
    const a = t,
      i = String(a.category ?? '').toLowerCase();
    if (!['sponsor', 'selfpromo', 'interaction'].includes(i)) {
      p('Skipping segment with invalid category:', a.category);
      continue;
    }
    const c = parseFloat(String(a.start ?? '')),
      l = parseFloat(String(a.end ?? ''));
    if (isNaN(c) || isNaN(l)) {
      p('Skipping segment with non-numeric start/end:', { start: a.start, end: a.end });
      continue;
    }
    if (c >= l) {
      p('Skipping segment with start >= end:', { category: i, start: c, end: l });
      continue;
    }
    if (l - c < 2) {
      p('Skipping segment too short (< 2s):', { category: i, start: c, end: l, duration: l - c });
      continue;
    }
    if (l - c > 360) {
      p('Skipping segment too long (> 360s):', { category: i, start: c, end: l, duration: l - c });
      continue;
    }
    s.push({ category: i, start: Math.round(c * 10) / 10, end: Math.round(l * 10) / 10 });
  }
  return K(s);
}
function K(e) {
  if (e.length <= 1) return e;
  const r = [...e].sort((n, s) => n.start - s.start),
    o = [r[0]];
  for (let n = 1; n < r.length; n++) {
    const s = o[o.length - 1],
      t = r[n];
    t.category === s.category && t.start <= s.end + 2
      ? (s.end = Math.max(s.end, t.end))
      : o.push(t);
  }
  return o;
}
function F(e, r) {
  const o = U(e);
  if (o.length <= r) return e;
  const n = Math.floor(e.length * (r / o.length)),
    s = Math.max(2, Math.ceil(e.length / Math.max(n, 2))),
    t = e.filter((a, i) => i % s === 0);
  return (t.length > 0 && t[t.length - 1] !== e[e.length - 1] && t.push(e[e.length - 1]), t);
}
async function V(e, r) {
  const o = r ?? (await chrome.storage.sync.get(['baseUrl', 'apiKey', 'model']));
  if (!o.apiKey || !o.baseUrl || !o.model) throw new Error(g('errorSettingsNotConfigured'));
  const { baseUrl: n, apiKey: s, model: t } = o,
    a = F(e, f.MAX_TRANSCRIPT_LENGTH),
    i = [
      { role: 'system', content: W },
      { role: 'user', content: U(a) },
    ];
  let c = await P(n, s, t, i);
  if (!c) {
    const l = [
      ...i,
      {
        role: 'user',
        content:
          'Your previous response was not valid JSON. Please analyze the transcript above again and return ONLY a JSON array: [{"category": "...", "start": number, "end": number}]. Do not include any other text.',
      },
    ];
    c = await P(n, s, t, l);
  }
  return { segments: c || [], model: t };
}
async function P(e, r, o, n) {
  var i, c, l;
  let s = e.replace(/\/+$/, '');
  s.endsWith('/v1') || (s += '/v1');
  const t = `${s}/chat/completions`;
  let a = null;
  for (let y = 0; y <= f.MAX_NETWORK_RETRIES; y++)
    try {
      const m = new AbortController(),
        S = setTimeout(() => m.abort(), f.FETCH_TIMEOUT_MS);
      let w;
      try {
        w = await fetch(t, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r}` },
          body: JSON.stringify({
            model: o,
            messages: n,
            temperature: f.TEMPERATURE,
            max_tokens: f.MAX_TOKENS,
          }),
          signal: m.signal,
        });
      } finally {
        clearTimeout(S);
      }
      if (!w.ok) {
        const O = await w.text().catch(() => ''),
          I = g('errorLlmApi', [String(w.status), O]);
        if (w.status >= 500 && y < f.MAX_NETWORK_RETRIES) {
          a = new Error(I);
          const L = f.NETWORK_RETRY_BASE_DELAY_MS * Math.pow(2, y);
          (p(`LLM API 5xx error, retrying in ${L}ms (attempt ${y + 1})`), await N(L));
          continue;
        }
        throw new Error(I);
      }
      const T = await w.json(),
        k =
          (l =
            (c = (i = T == null ? void 0 : T.choices) == null ? void 0 : i[0]) == null
              ? void 0
              : c.message) == null
            ? void 0
            : l.content;
      return k ? Y(k) : null;
    } catch (m) {
      if (m instanceof DOMException && m.name === 'AbortError')
        throw new Error(g('errorLlmTimeout'));
      if (m instanceof Error && m.message !== '' && !a) throw m;
      if (y < f.MAX_NETWORK_RETRIES) {
        a = m instanceof Error ? m : new Error(String(m));
        const S = f.NETWORK_RETRY_BASE_DELAY_MS * Math.pow(2, y);
        (p(`LLM network error, retrying in ${S}ms (attempt ${y + 1}):`, a.message), await N(S));
        continue;
      }
      throw m;
    }
  throw a ?? new Error('LLM request failed');
}
function d(e) {
  return e instanceof Error ? e.message : String(e);
}
async function X(e, r, o = !1) {
  if (!o) {
    if (await B(e)) return { action: 'skip', details: g('resultAlreadyProcessed') };
    try {
      const t = await v(e);
      if (t !== null && t.length > 0)
        return (
          await _(e),
          { action: 'skip', details: g('resultAlreadyHasSegments', [String(t.length)]) }
        );
    } catch (t) {
      (p('Failed to query SponsorBlock:', d(t)), M('SponsorBlock query failed', d(t)));
    }
  }
  let n, s;
  try {
    const t = await V(r);
    ((n = t.segments), (s = t.model));
  } catch (t) {
    return (
      A('LLM detection failed:', d(t)),
      M('LLM detection failed', d(t)),
      { action: 'error', details: g('resultLlmError', [d(t)]) }
    );
  }
  if (!n || n.length === 0) return (await _(e), { action: 'skip', details: g('resultNoSegments') });
  try {
    const t = await C();
    (await x(e, t, n), $('Submitted', n.length, 'segments for', e, 'via', s));
  } catch (t) {
    return (
      A('Failed to submit segments:', d(t)),
      M('SponsorBlock submit failed', d(t)),
      { action: 'partial', details: g('resultSubmitFailed', [String(n.length), d(t)]), segments: n }
    );
  }
  return (
    await _(e),
    { action: 'submitted', details: g('resultSubmitted', [String(n.length), s]), segments: n }
  );
}
chrome.runtime.onMessage.addListener((e, r, o) => {
  if (e.type === 'detectSponsors') {
    const { videoID: n, transcript: s, force: t } = e;
    return !n || !s || s.length === 0
      ? (o({ action: 'error', details: g('resultNoTranscript') }), !0)
      : (X(n, s, t)
          .then((a) => {
            o(a);
          })
          .catch((a) => {
            (A('Unexpected error:', d(a)), o({ action: 'error', details: d(a) }));
          }),
        !0);
  }
});
