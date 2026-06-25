/**
 * Mock chrome.storage and chrome.runtime APIs for testing.
 *
 * In-memory implementation that matches the real Chrome extension API surface
 * closely enough to test background scripts, content scripts, and library modules.
 */

interface StoredItems {
  [key: string]: unknown;
}

interface ChromeStorageArea {
  get(keys?: string | string[] | null): Promise<StoredItems>;
  set(items: StoredItems): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined | void;

export interface ChromeMock {
  storage: {
    sync: ChromeStorageArea;
    local: ChromeStorageArea;
  };
  i18n: {
    getMessage: (key: string, substitutions?: string | string[]) => string;
  };
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (listener: MessageListener) => void;
      removeListener: (listener: MessageListener) => void;
      hasListeners: () => boolean;
    };
    getManifest: () => { version: string; manifest_version: number };
  };
  /** Direct-access store for test introspection of storage.sync. */
  _syncStore: Record<string, unknown>;
  /** Direct-access store for test introspection of storage.local. */
  _localStore: Record<string, unknown>;
  /** Reset the entire mock state (storage + listeners). */
  _reset: () => void;
  /** Trigger all registered onMessage listeners with a message. Returns collected responses. */
  _triggerMessage: (message: unknown) => unknown[];
}

export function createChromeMock(): ChromeMock {
  // Separate stores to match real Chrome behavior (sync and local are independent)
  const syncStore: Record<string, unknown> = {};
  const localStore: Record<string, unknown> = {};
  const listeners: MessageListener[] = [];

  function createStorageArea(store: Record<string, unknown>): ChromeStorageArea {
    return {
      get: async (keys) => {
        const result: StoredItems = {};
        if (keys === null || keys === undefined) {
          return { ...store };
        }
        const keyList = Array.isArray(keys)
          ? keys
          : typeof keys === 'string'
            ? [keys]
            : Object.keys(keys);
        for (const k of keyList) {
          if (store[k] !== undefined) result[k] = store[k];
        }
        return result;
      },
      set: async (items) => {
        Object.assign(store, items);
      },
      remove: async (keys) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) delete store[k];
      },
    };
  }

  const mock: ChromeMock = {
    storage: {
      sync: createStorageArea(syncStore),
      local: createStorageArea(localStore),
    },
    i18n: {
      getMessage(key: string, _substitutions?: string | string[]) {
        // Return the key itself as a readable default for tests
        return `[${key}]`;
      },
    },
    runtime: {
      sendMessage: async (message) => {
        const responses: unknown[] = [];
        for (const listener of listeners) {
          const response = new Promise<unknown>((resolve) => {
            const handled = listener(message, {} as chrome.runtime.MessageSender, (resp) => {
              resolve(resp);
            });
            // If listener returned true, wait for async sendResponse
            if (!handled) resolve(undefined);
          });
          responses.push(await response);
        }
        return responses.length === 1 ? responses[0] : responses;
      },
      onMessage: {
        addListener(listener: MessageListener) {
          listeners.push(listener);
        },
        removeListener(listener: MessageListener) {
          const idx = listeners.indexOf(listener);
          if (idx !== -1) listeners.splice(idx, 1);
        },
        hasListeners() {
          return listeners.length > 0;
        },
      },
      getManifest: () => ({
        version: '0.1.0',
        manifest_version: 3,
      }),
    },
    _syncStore: syncStore,
    _localStore: localStore,
    _reset() {
      for (const k of Object.keys(syncStore)) delete syncStore[k];
      for (const k of Object.keys(localStore)) delete localStore[k];
      listeners.length = 0;
    },
    _triggerMessage(message: unknown) {
      const responses: unknown[] = [];
      for (const listener of listeners) {
        listener(message, {} as chrome.runtime.MessageSender, (resp) => {
          responses.push(resp);
        });
      }
      return responses;
    },
  };

  return mock;
}
