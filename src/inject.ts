/**
 * Page-context script — intercepts YouTube's timedtext response
 * from both XHR and fetch() calls.
 *
 * YouTube's player makes an call to /api/timedtext with the required
 * pot token. We intercept the response and store the parsed transcript
 * on a DOM element for the content script to read.
 *
 * IMPORTANT: This file is injected directly into the YouTube page context.
 * It MUST be fully self-contained — no imports, no module systems.
 */

(function () {
  'use strict';

  if (window.__sbai_inject_installed) return;
  window.__sbai_inject_installed = true;

  const DEBUG = false;
  function log(msg: string): void {
    // eslint-disable-next-line no-console
    if (DEBUG) console.log('[SponsorBlock AI]', msg);
  }

  // ── DOM element for data sharing ─────────────────────────────────

  const DATA_ID = '__sbai_data';
  let dataEl = document.getElementById(DATA_ID);
  if (!dataEl) {
    dataEl = document.createElement('div');
    dataEl.id = DATA_ID;
    dataEl.style.display = 'none';
    (document.documentElement || document.body).appendChild(dataEl);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  function getVideoIDFromUrl(): string | null {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('v')) return params.get('v');
      const m = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1]!;
      const m2 = window.location.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (m2) return m2[1]!;
    } catch (e) {
      log('Failed to extract video ID from URL: ' + String(e));
    }
    return null;
  }

  // Check if URL pathname matches the timedtext API endpoint
  function isTimedtextUrl(urlStr: string): boolean {
    try {
      const url = new URL(urlStr, location.origin);
      return url.pathname.includes('/api/timedtext');
    } catch {
      // If URL parsing fails, fall back to substring match
      return urlStr.indexOf('/api/timedtext') !== -1;
    }
  }

  interface TranscriptEntry {
    text: string;
    start: number;
    duration: number;
  }

  // ⚠ Canonical implementation: src/lib/transcript.ts parseJson3Transcript()
  // This copy must stay in sync manually (inject.js cannot import modules).
  // Last synced: transcript.ts parseJson3Transcript @ same commit.
  function parseJson3(data: unknown): TranscriptEntry[] | null {
    const entries: TranscriptEntry[] = [];
    const d = data as {
      events?: {
        segs?: { utf8?: string; tOffsetMs?: number }[];
        tStartMs: number;
        dDurationMs?: number;
      }[];
    };
    const events = d?.events ?? [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (!ev.segs) continue;
      const text = ev.segs
        .map(function (seg) {
          return seg.utf8 || '';
        })
        .join('')
        .trim();
      if (!text) continue;
      // Fall back through available duration sources
      const segDuration = ev.segs[0]?.tOffsetMs ?? 0;
      entries.push({
        text: text,
        start: ev.tStartMs / 1000,
        duration: (ev.dDurationMs || segDuration || 0) / 1000,
      });
    }
    return entries.length > 0 ? entries : null;
  }

  function storeTranscript(entries: TranscriptEntry[]): void {
    const videoID = getVideoIDFromUrl();
    log('Storing transcript: ' + entries.length + ' entries for ' + videoID);
    dataEl!.setAttribute('data-transcript', JSON.stringify(entries));
    dataEl!.setAttribute('data-transcript-video', videoID ?? '');
    try {
      document.dispatchEvent(new CustomEvent('sbai-transcript-ready'));
    } catch (e) {
      log('Failed to dispatch transcript-ready event: ' + String(e));
    }
  }

  // Try to parse and store transcript from a response body string.
  // Handles both XHR (responseText) and fetch (text).
  function tryHandleResponse(body: string): void {
    try {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        log('Failed to parse timedtext JSON: ' + String(e));
        return;
      }
      const entries = parseJson3(parsed);
      if (entries && entries.length > 0) {
        storeTranscript(entries);
      }
    } catch (e) {
      log('Failed to handle timedtext response: ' + String(e));
    }
  }

  // Safely extract a text body from an XHR, respecting responseType.
  function getXhrResponseText(xhr: XMLHttpRequest): string | null {
    try {
      // responseText throws if responseType is 'json' or 'blob' etc.
      return xhr.responseText;
    } catch {
      // If responseType is 'json', try the parsed response instead
      if (xhr.responseType === 'json' && xhr.response) {
        try {
          return JSON.stringify(xhr.response);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  // ── Intercept XHR (YouTube primarily uses XHR for timedtext) ─────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OrigXHR = (window as any).XMLHttpRequest;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).XMLHttpRequest = function (this: XMLHttpRequest) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xhr = new OrigXHR() as any;
    const origOpen = xhr.open;
    const origSend = xhr.send;
    let xhrUrl = '';

    xhr.open = function (_method: string, reqUrl: string, ...args: unknown[]) {
      xhrUrl = typeof reqUrl === 'string' ? reqUrl : String(reqUrl);
      return origOpen.apply(this, [_method, reqUrl, ...args] as Parameters<typeof origOpen>);
    };

    xhr.send = function (...args: unknown[]) {
      // Only instrument timedtext requests to avoid unnecessary overhead
      if (isTimedtextUrl(xhrUrl)) {
        xhr.addEventListener('load', function () {
          if (xhr.status === 200) {
            const text = getXhrResponseText(xhr);
            if (text) tryHandleResponse(text);
          }
        });
      }
      return origSend.apply(this, args as Parameters<typeof origSend>);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return xhr as any;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).XMLHttpRequest.prototype = OrigXHR.prototype;

  // ── Intercept fetch (belt-and-suspenders — YouTube may migrate) ──

  if (typeof window.fetch !== 'undefined') {
    const origFetch = window.fetch.bind(window);
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const response = await origFetch(input, init);

      // Only intercept timedtext requests to avoid overhead
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (isTimedtextUrl(urlStr)) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          tryHandleResponse(text);
        } catch (e) {
          log('Failed to handle fetch response: ' + String(e));
        }
      }

      return response;
    };
  }

  log('Inject script loaded');
})();
