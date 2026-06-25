import type { LLMSettings } from '../types/global';
import { t } from '../lib/i18n';
import { getErrorLog, clearErrorLog } from '../lib/error-log';

const form = document.getElementById('settings-form') as HTMLFormElement;
const baseUrlInput = document.getElementById('base-url') as HTMLInputElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const rescanBtn = document.getElementById('rescan-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

// Cache the original button labels so we can restore them after status updates
const saveBtnLabel = saveBtn.textContent || t('btnSaveSettings');
const rescanBtnLabel = rescanBtn.textContent || t('btnRescan');

// I18n: populate all [data-i18n] elements at startup
function i18nPopulate(): void {
  document.title = chrome.i18n.getMessage('extName') || 'SponsorBlock AI';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')!;
    if (key) el.textContent = chrome.i18n.getMessage(key) || el.textContent || `[${key}]`;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder')!;
    if (el instanceof HTMLInputElement) {
      el.placeholder = chrome.i18n.getMessage(key) || el.placeholder || `[${key}]`;
    }
  });
}

// Load saved settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
  i18nPopulate();

  const settings = (await chrome.storage.sync.get(['baseUrl', 'apiKey', 'model'])) as LLMSettings;
  if (settings.baseUrl) baseUrlInput.value = settings.baseUrl;
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  if (settings.model) modelInput.value = settings.model;
});

// Show status message
function showStatus(message: string, type: string): void {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => {
    statusEl.className = 'status hidden';
  }, 3000);
}

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const baseUrl = baseUrlInput.value.trim().replace(/\/$/, '');
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();

  if (!baseUrl || !apiKey || !model) {
    showStatus(t('statusAllFieldsRequired'), 'error');
    return;
  }

  try {
    new URL(baseUrl);
  } catch {
    showStatus(t('statusInvalidUrl'), 'error');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = t('statusSaving');

  try {
    await chrome.storage.sync.set({ baseUrl, apiKey, model });
    showStatus(t('statusSaved'), 'success');
  } catch (err) {
    showStatus(t('statusSaveFailed', [(err as Error).message]), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = saveBtnLabel;
  }
});

// Force re-scan current YouTube video
rescanBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showStatus(t('statusCannotAccessTab'), 'error');
    return;
  }

  rescanBtn.disabled = true;
  rescanBtn.textContent = t('statusScanning');

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'forceRescan' });
    showStatus(t('statusRescanStarted'), 'success');
    setTimeout(() => window.close(), 1500);
  } catch {
    showStatus(t('statusOpenYoutubeFirst'), 'error');
  } finally {
    rescanBtn.disabled = false;
    rescanBtn.textContent = rescanBtnLabel;
  }
});

// ── Error log ──────────────────────────────────────────────────────

const toggleBtn = document.getElementById('toggle-error-log') as HTMLButtonElement;
const errorLogContent = document.getElementById('error-log-content') as HTMLDivElement;
const errorLogList = document.getElementById('error-log-list') as HTMLDivElement;
const errorCountEl = document.getElementById('error-count') as HTMLSpanElement;
const copyBtn = document.getElementById('copy-error-log') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-error-log') as HTMLButtonElement;

async function refreshErrorLog(): Promise<void> {
  const errors = await getErrorLog();

  // Update count badge
  errorCountEl.textContent = String(errors.length);
  errorCountEl.className = errors.length === 0 ? 'error-count zero' : 'error-count';

  // Render list
  if (errors.length === 0) {
    errorLogList.innerHTML = '<div class="error-log-empty">' + t('errorLogEmpty') + '</div>';
    return;
  }

  errorLogList.innerHTML = errors
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleString();
      return (
        '<div class="error-log-item">' +
        '<div class="error-time">' +
        time +
        '</div>' +
        '<div class="error-msg">' +
        escapeHtml(e.message) +
        '</div>' +
        (e.detail ? '<div class="error-detail">' + escapeHtml(e.detail) + '</div>' : '') +
        '</div>'
      );
    })
    .join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

toggleBtn.addEventListener('click', async () => {
  const isHidden = errorLogContent.classList.toggle('hidden');
  if (!isHidden) {
    await refreshErrorLog();
  }
});

copyBtn.addEventListener('click', async () => {
  const errors = await getErrorLog();
  const text = errors
    .map((e) => {
      const time = new Date(e.timestamp).toISOString();
      return `[${time}] ${e.message}${e.detail ? ' — ' + e.detail : ''}`;
    })
    .join('\n');

  try {
    await navigator.clipboard.writeText(text || t('errorLogEmpty'));
    showStatus(t('statusErrorLogCopied'), 'success');
  } catch {
    showStatus(t('statusCopyFailed'), 'error');
  }
});

clearBtn.addEventListener('click', async () => {
  await clearErrorLog();
  await refreshErrorLog();
  showStatus(t('statusErrorLogCleared'), 'success');
});

// Refresh on popup open
document.addEventListener('DOMContentLoaded', async () => {
  await refreshErrorLog();
});
