import { t as n, g, c as L } from '../assets/error-log-BU741YR6.js';
const f = document.getElementById('settings-form'),
  y = document.getElementById('base-url'),
  v = document.getElementById('api-key'),
  p = document.getElementById('model'),
  a = document.getElementById('save-btn'),
  o = document.getElementById('rescan-btn'),
  i = document.getElementById('status'),
  h = a.textContent || n('btnSaveSettings'),
  b = o.textContent || n('btnRescan');
function B() {
  ((document.title = chrome.i18n.getMessage('extName') || 'SponsorBlock AI'),
    document.querySelectorAll('[data-i18n]').forEach((t) => {
      const e = t.getAttribute('data-i18n');
      e && (t.textContent = chrome.i18n.getMessage(e) || t.textContent || `[${e}]`);
    }),
    document.querySelectorAll('[data-i18n-placeholder]').forEach((t) => {
      const e = t.getAttribute('data-i18n-placeholder');
      t instanceof HTMLInputElement &&
        (t.placeholder = chrome.i18n.getMessage(e) || t.placeholder || `[${e}]`);
    }));
}
document.addEventListener('DOMContentLoaded', async () => {
  B();
  const t = await chrome.storage.sync.get(['baseUrl', 'apiKey', 'model']);
  (t.baseUrl && (y.value = t.baseUrl),
    t.apiKey && (v.value = t.apiKey),
    t.model && (p.value = t.model));
});
function r(t, e) {
  ((i.textContent = t),
    (i.className = `status ${e}`),
    setTimeout(() => {
      i.className = 'status hidden';
    }, 3e3));
}
f.addEventListener('submit', async (t) => {
  t.preventDefault();
  const e = y.value.trim().replace(/\/$/, ''),
    s = v.value.trim(),
    c = p.value.trim();
  if (!e || !s || !c) {
    r(n('statusAllFieldsRequired'), 'error');
    return;
  }
  try {
    new URL(e);
  } catch {
    r(n('statusInvalidUrl'), 'error');
    return;
  }
  ((a.disabled = !0), (a.textContent = n('statusSaving')));
  try {
    (await chrome.storage.sync.set({ baseUrl: e, apiKey: s, model: c }),
      r(n('statusSaved'), 'success'));
  } catch (E) {
    r(n('statusSaveFailed', [E.message]), 'error');
  } finally {
    ((a.disabled = !1), (a.textContent = h));
  }
});
o.addEventListener('click', async () => {
  const [t] = await chrome.tabs.query({ active: !0, currentWindow: !0 });
  if (!(t != null && t.id)) {
    r(n('statusCannotAccessTab'), 'error');
    return;
  }
  ((o.disabled = !0), (o.textContent = n('statusScanning')));
  try {
    (await chrome.tabs.sendMessage(t.id, { type: 'forceRescan' }),
      r(n('statusRescanStarted'), 'success'),
      setTimeout(() => window.close(), 1500));
  } catch {
    r(n('statusOpenYoutubeFirst'), 'error');
  } finally {
    ((o.disabled = !1), (o.textContent = b));
  }
});
const I = document.getElementById('toggle-error-log'),
  w = document.getElementById('error-log-content'),
  l = document.getElementById('error-log-list'),
  u = document.getElementById('error-count'),
  C = document.getElementById('copy-error-log'),
  S = document.getElementById('clear-error-log');
async function d() {
  const t = await g();
  if (
    ((u.textContent = String(t.length)),
    (u.className = t.length === 0 ? 'error-count zero' : 'error-count'),
    t.length === 0)
  ) {
    l.innerHTML = '<div class="error-log-empty">' + n('errorLogEmpty') + '</div>';
    return;
  }
  l.innerHTML = t
    .map(
      (e) =>
        '<div class="error-log-item"><div class="error-time">' +
        new Date(e.timestamp).toLocaleString() +
        '</div><div class="error-msg">' +
        m(e.message) +
        '</div>' +
        (e.detail ? '<div class="error-detail">' + m(e.detail) + '</div>' : '') +
        '</div>',
    )
    .join('');
}
function m(t) {
  const e = document.createElement('div');
  return ((e.textContent = t), e.innerHTML);
}
I.addEventListener('click', async () => {
  w.classList.toggle('hidden') || (await d());
});
C.addEventListener('click', async () => {
  const e = (await g()).map(
    (s) =>
      `[${new Date(s.timestamp).toISOString()}] ${s.message}${s.detail ? ' — ' + s.detail : ''}`,
  ).join(`
`);
  try {
    (await navigator.clipboard.writeText(e || n('errorLogEmpty')),
      r(n('statusErrorLogCopied'), 'success'));
  } catch {
    r(n('statusCopyFailed'), 'error');
  }
});
S.addEventListener('click', async () => {
  (await L(), await d(), r(n('statusErrorLogCleared'), 'success'));
});
document.addEventListener('DOMContentLoaded', async () => {
  await d();
});
