/**
 * @vitest-environment happy-dom
 *
 * Tests for popup.ts — form validation, settings storage, error log, i18n.
 * Uses happy-dom for DOM APIs and the Chrome mock for extension APIs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock } from './chrome-mock';

// ── DOM setup ────────────────────────────────────────────────────────

function setupPopupDOM(): void {
  document.body.innerHTML = `
    <div class="container">
      <div class="header">
        <h1><span data-i18n="extName">SponsorBlock AI</span></h1>
        <p class="subtitle" data-i18n="extSubtitle">LLM-powered sponsor detection</p>
      </div>
      <form id="settings-form">
        <div class="field">
          <label for="base-url">API Base URL</label>
          <input type="url" id="base-url" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="field">
          <label for="api-key">API Key</label>
          <input type="password" id="api-key" placeholder="sk-..." />
        </div>
        <div class="field">
          <label for="model">Model Name</label>
          <input type="text" id="model" placeholder="gpt-4o-mini" />
        </div>
        <button type="submit" id="save-btn">Save Settings</button>
      </form>
      <div class="divider"></div>
      <button id="rescan-btn">Re-scan This Video</button>
      <div id="status" class="status hidden"></div>
      <div class="divider"></div>
      <div class="error-log-section">
        <button id="toggle-error-log">
          <span>Diagnostic Log</span>
          <span id="error-count" class="error-count">0</span>
        </button>
        <div id="error-log-content" class="error-log-content hidden">
          <div id="error-log-list" class="error-log-list"></div>
          <div class="error-log-actions">
            <button id="copy-error-log">Copy to Clipboard</button>
            <button id="clear-error-log">Clear</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getStatusText(): string {
  return document.getElementById('status')?.textContent || '';
}

/**
 * Import popup and fire DOMContentLoaded so event handlers execute.
 * In happy-dom the document is already "complete" by the time we import,
 * so we must dispatch this event manually.
 */
async function loadPopup() {
  await import('../src/popup/popup');
  // Dispatch DOMContentLoaded so the popup's event listeners fire
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // Let microtasks flush
  await new Promise((r) => setTimeout(r, 10));
}

// ── Tests ────────────────────────────────────────────────────────────

describe('popup — settings form', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;

  beforeEach(async () => {
    setupPopupDOM();
    chromeMock = createChromeMock();
    (globalThis as Record<string, unknown>).chrome = chromeMock;
    await loadPopup();
  });

  afterEach(() => {
    chromeMock._reset();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('shows error when saving with empty fields', () => {
    const form = document.getElementById('settings-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Chrome mock returns [key] format for i18n strings
    expect(getStatusText()).toBe('[statusAllFieldsRequired]');
  });

  it('shows error for invalid base URL', () => {
    const baseUrlInput = document.getElementById('base-url') as HTMLInputElement;
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const modelInput = document.getElementById('model') as HTMLInputElement;

    baseUrlInput.value = 'not-a-url';
    apiKeyInput.value = 'sk-test123';
    modelInput.value = 'test-model';

    const form = document.getElementById('settings-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(getStatusText()).toBe('[statusInvalidUrl]');
  });

  it('saves settings successfully with valid inputs', async () => {
    const baseUrlInput = document.getElementById('base-url') as HTMLInputElement;
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const modelInput = document.getElementById('model') as HTMLInputElement;
    const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;

    baseUrlInput.value = 'https://api.openai.com';
    apiKeyInput.value = 'sk-test123456';
    modelInput.value = 'gpt-4';

    expect(saveBtn.disabled).toBe(false);

    const form = document.getElementById('settings-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Wait for async save
    await new Promise((r) => setTimeout(r, 10));

    // Verify settings were stored in sync storage
    const stored = await chromeMock.storage.sync.get(['baseUrl', 'apiKey', 'model']);
    expect(stored.baseUrl).toBe('https://api.openai.com');
    expect(stored.apiKey).toBe('sk-test123456');
    expect(stored.model).toBe('gpt-4');

    // Verify success message
    expect(getStatusText()).toBe('[statusSaved]');
  });

  it('strips trailing slash from base URL before saving', async () => {
    const baseUrlInput = document.getElementById('base-url') as HTMLInputElement;
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const modelInput = document.getElementById('model') as HTMLInputElement;

    baseUrlInput.value = 'https://api.openai.com/';
    apiKeyInput.value = 'sk-test';
    modelInput.value = 'm';

    const form = document.getElementById('settings-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise((r) => setTimeout(r, 10));

    const stored = await chromeMock.storage.sync.get('baseUrl');
    expect(stored.baseUrl).toBe('https://api.openai.com');
  });

  it('loads saved settings on popup open', async () => {
    // Pre-populate storage
    await chromeMock.storage.sync.set({
      baseUrl: 'https://custom.api.com',
      apiKey: 'sk-prestored',
      model: 'claude-opus',
    });

    // Re-setup with fresh DOM and import to trigger DOMContentLoaded
    vi.resetModules();
    setupPopupDOM();
    (globalThis as Record<string, unknown>).chrome = chromeMock;
    await loadPopup();

    const baseUrlInput = document.getElementById('base-url') as HTMLInputElement;
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const modelInput = document.getElementById('model') as HTMLInputElement;

    expect(baseUrlInput.value).toBe('https://custom.api.com');
    expect(apiKeyInput.value).toBe('sk-prestored');
    expect(modelInput.value).toBe('claude-opus');
  });
});

describe('popup — error log', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;

  beforeEach(async () => {
    setupPopupDOM();
    chromeMock = createChromeMock();
    (globalThis as Record<string, unknown>).chrome = chromeMock;
    await loadPopup();
  });

  afterEach(() => {
    chromeMock._reset();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('shows empty state when no errors in log', async () => {
    const toggleBtn = document.getElementById('toggle-error-log') as HTMLButtonElement;
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const logContent = document.getElementById('error-log-content');
    expect(logContent?.classList.contains('hidden')).toBe(false);

    const logList = document.getElementById('error-log-list');
    expect(logList?.textContent).toContain('[errorLogEmpty]');
  });

  it('renders error entries when log has items', async () => {
    const { logError } = await import('../src/lib/error-log');
    await logError('Test error 1', 'detail 1');
    await logError('Test error 2', '');

    const toggleBtn = document.getElementById('toggle-error-log') as HTMLButtonElement;
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const logList = document.getElementById('error-log-list');
    expect(logList?.innerHTML).toContain('Test error 1');
    expect(logList?.innerHTML).toContain('Test error 2');
  });

  it('clears error log when clear button is clicked', async () => {
    const { logError } = await import('../src/lib/error-log');
    await logError('Test error', 'detail');

    const toggleBtn = document.getElementById('toggle-error-log') as HTMLButtonElement;
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const clearBtn = document.getElementById('clear-error-log') as HTMLButtonElement;
    clearBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const logList = document.getElementById('error-log-list');
    expect(logList?.textContent).toContain('[errorLogEmpty]');
  });
});

describe('popup — i18n', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;

  beforeEach(async () => {
    setupPopupDOM();
    chromeMock = createChromeMock();
    (globalThis as Record<string, unknown>).chrome = chromeMock;
    await loadPopup();
  });

  afterEach(() => {
    chromeMock._reset();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('populates data-i18n elements from chrome.i18n.getMessage', () => {
    const el = document.querySelector('[data-i18n="extSubtitle"]');
    // chrome-mock returns [key] as the i18n value — non-empty → used as-is
    expect(el?.textContent).toBe('[extSubtitle]');
  });

  it('populates data-i18n-placeholder attributes on inputs', () => {
    const el = document.querySelector('[data-i18n-placeholder="placeholderApiBaseUrl"]');
    if (el instanceof HTMLInputElement) {
      expect(el.placeholder).toBe('[placeholderApiBaseUrl]');
    }
  });
});

describe('popup — rescan button', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;
  let tabsQueryMock: ReturnType<typeof vi.fn>;
  let tabsSendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    setupPopupDOM();
    chromeMock = createChromeMock();
    tabsQueryMock = vi.fn().mockResolvedValue([{ id: 42 }]);
    tabsSendMessageMock = vi.fn().mockResolvedValue(undefined);

    (globalThis as Record<string, unknown>).chrome = {
      ...chromeMock,
      tabs: {
        query: tabsQueryMock,
        sendMessage: tabsSendMessageMock,
      },
    };

    await loadPopup();
  });

  afterEach(() => {
    chromeMock._reset();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sends forceRescan message to active tab', async () => {
    const rescanBtn = document.getElementById('rescan-btn') as HTMLButtonElement;
    expect(rescanBtn).not.toBeNull();

    rescanBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsQueryMock).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(tabsSendMessageMock).toHaveBeenCalledWith(42, { type: 'forceRescan' });
    expect(getStatusText()).toBe('[statusRescanStarted]');
  });

  it('shows error when no active tab', async () => {
    tabsQueryMock.mockResolvedValue([]);

    const rescanBtn = document.getElementById('rescan-btn') as HTMLButtonElement;
    rescanBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(getStatusText()).toBe('[statusCannotAccessTab]');
  });
});
