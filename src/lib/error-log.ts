/**
 * Error log — persists recent errors to chrome.storage.local so users
 * can review and copy them for diagnostics / bug reports.
 *
 * Usage:
 *   import { logError, getErrorLog, clearErrorLog } from '../lib/error-log';
 *
 *   try { ... } catch (err) {
 *     logError('LLM detection failed', errorMessage(err));
 *   }
 */

import { ERROR_LOG } from '../config';

interface ErrorEntry {
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  /** Short context label, e.g. "LLM detection failed". */
  message: string;
  /** Additional detail, e.g. error message or stack trace. */
  detail: string;
}

const STORAGE_KEY = 'sbai_error_log';

/** Record an error to the persistent log. Prunes to MAX_ENTRIES. */
export async function logError(message: string, detail = ''): Promise<void> {
  try {
    const result = (await chrome.storage.local.get(STORAGE_KEY)) as Record<string, ErrorEntry[]>;
    const log: ErrorEntry[] = result[STORAGE_KEY] ?? [];

    log.push({
      timestamp: Date.now(),
      message,
      detail,
    });

    // Keep only the most recent entries
    while (log.length > ERROR_LOG.MAX_ENTRIES) {
      log.shift();
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: log });
  } catch {
    // Silently fail — we can't log errors about error-logging
  }
}

/** Retrieve all logged errors, newest first. */
export async function getErrorLog(): Promise<ErrorEntry[]> {
  try {
    const result = (await chrome.storage.local.get(STORAGE_KEY)) as Record<string, ErrorEntry[]>;
    const log: ErrorEntry[] = result[STORAGE_KEY] ?? [];
    return [...log].reverse();
  } catch {
    return [];
  }
}

/** Clear the entire error log. */
export async function clearErrorLog(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
