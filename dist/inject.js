(function () {
  'use strict';
  (function () {
    if (window.__sbai_inject_installed) return;
    window.__sbai_inject_installed = !0;
    function _(t) {}
    const a = '__sbai_data';
    let c = document.getElementById(a);
    c ||
      ((c = document.createElement('div')),
      (c.id = a),
      (c.style.display = 'none'),
      (document.documentElement || document.body).appendChild(c));
    function p() {
      try {
        const t = new URLSearchParams(window.location.search);
        if (t.has('v')) return t.get('v');
        const n = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (n) return n[1];
        const e = window.location.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
        if (e) return e[1];
      } catch {}
      return null;
    }
    function u(t) {
      try {
        return new URL(t, location.origin).pathname.includes('/api/timedtext');
      } catch {
        return t.indexOf('/api/timedtext') !== -1;
      }
    }
    function h(t) {
      var r;
      const n = [],
        e = t,
        i = (e == null ? void 0 : e.events) ?? [];
      for (let o = 0; o < i.length; o++) {
        const s = i[o];
        if (!s.segs) continue;
        const l = s.segs
          .map(function (y) {
            return y.utf8 || '';
          })
          .join('')
          .trim();
        if (!l) continue;
        const g = ((r = s.segs[0]) == null ? void 0 : r.tOffsetMs) ?? 0;
        n.push({ text: l, start: s.tStartMs / 1e3, duration: (s.dDurationMs || g || 0) / 1e3 });
      }
      return n.length > 0 ? n : null;
    }
    function w(t) {
      const n = p();
      ('' + t.length + n,
        c.setAttribute('data-transcript', JSON.stringify(t)),
        c.setAttribute('data-transcript-video', n ?? ''));
      try {
        document.dispatchEvent(new CustomEvent('sbai-transcript-ready'));
      } catch {}
    }
    function d(t) {
      try {
        let n = null;
        try {
          n = JSON.parse(t);
        } catch (i) {
          '' + String(i);
          return;
        }
        const e = h(n);
        e && e.length > 0 && w(e);
      } catch {}
    }
    function m(t) {
      try {
        return t.responseText;
      } catch {
        if (t.responseType === 'json' && t.response)
          try {
            return JSON.stringify(t.response);
          } catch {
            return null;
          }
        return null;
      }
    }
    const f = window.XMLHttpRequest;
    if (
      ((window.XMLHttpRequest = function () {
        const t = new f(),
          n = t.open,
          e = t.send;
        let i = '';
        return (
          (t.open = function (r, o, ...s) {
            return ((i = typeof o == 'string' ? o : String(o)), n.apply(this, [r, o, ...s]));
          }),
          (t.send = function (...r) {
            return (
              u(i) &&
                t.addEventListener('load', function () {
                  if (t.status === 200) {
                    const o = m(t);
                    o && d(o);
                  }
                }),
              e.apply(this, r)
            );
          }),
          t
        );
      }),
      (window.XMLHttpRequest.prototype = f.prototype),
      typeof window.fetch < 'u')
    ) {
      const t = window.fetch.bind(window);
      window.fetch = async function (n, e) {
        const i = await t(n, e),
          r = typeof n == 'string' ? n : n instanceof URL ? n.href : n.url;
        if (u(r))
          try {
            const s = await i.clone().text();
            d(s);
          } catch {}
        return i;
      };
    }
  })();
})();
