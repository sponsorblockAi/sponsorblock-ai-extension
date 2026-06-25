(function () {
  'use strict';
  const c = {
      TRANSCRIPT_POLL_INTERVAL_MS: 500,
      INJECT_TRANSCRIPT_TIMEOUT_MS: 1e4,
      BADGE_DISPLAY_MS: 6e3,
      NAVIGATION_DELAY_MS: 1500,
      RELOAD_DELAY_MS: 1500,
      SCROLL_STEP_MAX: 2e3,
      SCROLL_WAIT_MS: 150,
      PANEL_WAIT_MS: 500,
      PANEL_OPEN_RETRIES: 15,
    },
    P = { MAX_ENTRIES: 50 },
    R = '[SponsorBlock AI]';
  function x(...a) {
    console.log(R, ...a);
  }
  function O(...a) {
    console.error(R, ...a);
  }
  function _(a, l) {
    return chrome.i18n.getMessage(a, l) || `[${a}]`;
  }
  const E = 'sbai_error_log';
  async function D(a, l = '') {
    try {
      const m = (await chrome.storage.local.get(E))[E] ?? [];
      for (m.push({ timestamp: Date.now(), message: a, detail: l }); m.length > P.MAX_ENTRIES; )
        m.shift();
      await chrome.storage.local.set({ [E]: m });
    } catch {}
  }
  function y(a) {
    return new Promise((l) => setTimeout(l, a));
  }
  (function () {
    (function () {
      const t = document.createElement('script');
      ((t.src = chrome.runtime.getURL('inject.js')),
        (t.onload = () => t.remove()),
        (document.head || document.documentElement).appendChild(t));
    })();
    let a = null,
      l = !1,
      w = !1;
    function m() {
      const t = new URLSearchParams(window.location.search);
      if (t.has('v')) return t.get('v');
      const r = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (r) return r[1];
      const e = window.location.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      return e ? e[1] : null;
    }
    function q() {
      const t = [
        'Show transcript',
        '显示字幕',
        '字幕を表示',
        '대본 보기',
        'Afficher la transcription',
        'Transkript anzeigen',
        'Mostrar transcripción',
        '转写文稿',
        '内容转文字',
        '显示转写文稿',
        'แสดงบทบรรยาย',
      ];
      for (const e of t) {
        const n = document.querySelector(`button[aria-label="${e}"]`);
        if (n) return n;
      }
      const r = document.querySelectorAll('yt-formatted-string');
      for (const e of r) {
        const n = (e.textContent || '').toLowerCase();
        if (
          n.includes('transcript') ||
          n.includes('字幕') ||
          n.includes('대본') ||
          n.includes('转写') ||
          n.includes('文字')
        ) {
          const i = e.closest('button, tp-yt-paper-item, ytd-menu-service-item-renderer');
          if (i) return i;
        }
      }
      return null;
    }
    function k() {
      const t = document.querySelector('#description-inline-expander button, #expand');
      t && t.offsetParent !== null && t.click();
    }
    async function B() {
      if (
        document.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer')
          .length > 0
      )
        return !0;
      (k(), await y(c.PANEL_WAIT_MS));
      const r = q();
      if (!r) return !1;
      r.click();
      for (let e = 0; e < c.PANEL_OPEN_RETRIES; e++) {
        await y(c.PANEL_WAIT_MS);
        for (const n of ['transcript-segment-view-model', 'ytd-transcript-segment-renderer'])
          if (document.querySelectorAll(n).length > 0) return !0;
      }
      return !1;
    }
    async function G() {
      var n, i;
      const t = document.querySelector(
        '#transcript-scrollbox, [class*="transcript"] [class*="scroll"]',
      );
      if (t && t.scrollHeight > t.clientHeight) {
        t.scrollTop = 0;
        const f = Math.min(c.SCROLL_STEP_MAX, t.scrollHeight),
          d = Math.ceil(t.scrollHeight / f);
        for (let g = 0; g < d; g++) ((t.scrollTop += f), await y(c.SCROLL_WAIT_MS));
        ((t.scrollTop = 0), await y(300));
      }
      let r = document.querySelectorAll('transcript-segment-view-model');
      if (
        (r.length || (r = document.querySelectorAll('ytd-transcript-segment-renderer')), !r.length)
      )
        return null;
      const e = [];
      for (const o of r) {
        const f = o.querySelector(
            '.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp, [class*="timestamp"]',
          ),
          d = o.querySelector('span.ytAttributedStringHost, yt-formatted-string'),
          g = ((f == null ? void 0 : f.textContent) || '').trim();
        let p = ((d == null ? void 0 : d.textContent) || '').trim();
        if (!p)
          for (const s of o.querySelectorAll('span')) {
            const b = ((n = s.textContent) == null ? void 0 : n.trim()) || '';
            if (b.length > 5) {
              p = b;
              break;
            }
          }
        if (!p) {
          const s = ((i = o.textContent) == null ? void 0 : i.trim()) || '',
            b = s.match(/^(\d+:\d+(?::\d+)?)\s*(.*)/);
          p = b ? b[2] : s;
        }
        if (!p) continue;
        let S = 0;
        if (g) {
          const s = g.split(':');
          s.length === 3
            ? (S = parseInt(s[0]) * 3600 + parseInt(s[1]) * 60 + parseFloat(s[2]))
            : s.length === 2 && (S = parseInt(s[0]) * 60 + parseFloat(s[1]));
        }
        e.push({ text: p, start: S, duration: 0 });
      }
      for (let o = 0; o < e.length; o++)
        e[o].duration = o < e.length - 1 ? e[o + 1].start - e[o].start : 5;
      return e.length ? e : null;
    }
    let u = null,
      M,
      N = 0;
    const V = {
      submitted: { bg: 'rgba(0,200,100,0.9)', fg: '#fff' },
      skip: { bg: 'rgba(255,255,255,0.2)', fg: '#ccc' },
      error: { bg: 'rgba(255,80,80,0.9)', fg: '#fff' },
      processing: { bg: 'rgba(0,160,255,0.9)', fg: '#fff' },
    };
    function h(t, r) {
      u ||
        ((u = document.createElement('div')),
        (u.id = 'sb-ai-badge'),
        (u.style.cssText =
          'position:fixed;bottom:80px;right:16px;z-index:9999;padding:6px 12px;border-radius:8px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none;transition:opacity 0.3s'),
        document.body.appendChild(u));
      const e = V[r] || { bg: 'rgba(255,255,255,0.2)', fg: '#ccc' };
      ((u.style.background = e.bg),
        (u.style.color = e.fg),
        (u.style.opacity = '1'),
        (u.textContent = t));
      const n = ++N;
      (clearTimeout(M),
        (M = window.setTimeout(() => {
          N === n && (u.style.opacity = '0');
        }, c.BADGE_DISPLAY_MS)));
    }
    function v(t) {
      const r = document.getElementById('__sbai_data');
      if (!r || r.getAttribute('data-transcript-video') !== t) return null;
      const e = r.getAttribute('data-transcript');
      if (!e) return null;
      try {
        const n = JSON.parse(e);
        if (Array.isArray(n) && n.length) return n;
      } catch {}
      return null;
    }
    function Y(t, r, e) {
      return new Promise((n) => {
        const i = Date.now();
        let o = !1,
          f;
        const d = (s) => {
            o ||
              ((o = !0),
              clearTimeout(f),
              document.removeEventListener('sbai-transcript-ready', g),
              e && e.removeEventListener('abort', S),
              n(s));
          },
          g = () => d(v(t)),
          p = () => {
            if (o) return;
            const s = v(t);
            if (s) return d(s);
            if (Date.now() - i > r) return d(null);
            f = window.setTimeout(p, c.TRANSCRIPT_POLL_INTERVAL_MS);
          },
          S = () => {
            d(null);
          };
        if (e) {
          if (e.aborted) {
            n(null);
            return;
          }
          e.addEventListener('abort', S);
        }
        (document.addEventListener('sbai-transcript-ready', g), p());
      });
    }
    function z() {
      (h(_('badgeSubmitted'), 'submitted'), setTimeout(() => location.reload(), c.RELOAD_DELAY_MS));
    }
    let A = null;
    async function L(t = !1) {
      if (l) return;
      const r = m();
      if (!r || (!t && r === a)) return;
      (A && A.abort(), (A = new AbortController()));
      const e = A.signal;
      l = !0;
      try {
        let n = await Y(r, c.INJECT_TRANSCRIPT_TIMEOUT_MS, e);
        if ((!n && !e.aborted && (await B()) && !e.aborted && (n = await G()), e.aborted)) return;
        if (!n || n.length === 0) {
          ((a = r), (l = !1));
          return;
        }
        (x('Transcript: ' + n.length + ' entries'),
          h(_(t ? 'badgeReanalyzing' : 'badgeAnalyzing'), 'processing'));
        const i = await chrome.runtime.sendMessage({
          type: 'detectSponsors',
          videoID: r,
          transcript: n,
          force: t,
        });
        i.action === 'submitted'
          ? (h('✓ ' + i.details, 'submitted'), z())
          : i.action === 'error'
            ? h('✗ ' + i.details, 'error')
            : h(i.details, 'skip');
      } catch (n) {
        const i = n instanceof Error ? n.message : String(n);
        (O('Content script error:', i), D('Content script error', i));
      } finally {
        ((a = r), (l = !1));
      }
    }
    let I = location.href;
    function T() {
      if (location.href === I) return;
      I = location.href;
      const t = m();
      t && t !== a && setTimeout(() => L(), c.NAVIGATION_DELAY_MS);
    }
    function H() {
      if (w) return;
      ((w = !0), document.addEventListener('yt-navigate-finish', T));
      const t = history.pushState.bind(history),
        r = history.replaceState.bind(history);
      ((history.pushState = function (...e) {
        (t(...e), T());
      }),
        (history.replaceState = function (...e) {
          (r(...e), T());
        }),
        window.addEventListener('popstate', T));
    }
    H();
    function C() {
      m() && ((I = location.href), setTimeout(() => L(), c.NAVIGATION_DELAY_MS));
    }
    (document.readyState === 'complete' ? C() : window.addEventListener('load', C),
      chrome.runtime.onMessage.addListener((t) => {
        t.type === 'forceRescan' && L(!0);
      }));
  })();
})();
