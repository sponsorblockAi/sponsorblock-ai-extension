/**
 * Shared logger — all console output goes through here.
 *
 * Usage:
 *   import { log, warn, error, debug } from './lib/logger';
 *
 *   log('Transcript received:', count, 'entries');
 *   warn('Skipping segment:', { category, start, end });
 *   error('LLM call failed:', err.message);
 *   debug('Internal state:', data);  // off by default
 */

const TAG = '[SponsorBlock AI]';

/** Always-on info log. */
export function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(TAG, ...args);
}

/** Always-on warning. */
export function warn(...args: unknown[]): void {
  console.warn(TAG, ...args);
}

/** Always-on error. */
export function error(...args: unknown[]): void {
  console.error(TAG, ...args);
}

/**
 * Development-only log — silent unless enabled.
 * Call enableDebug() from the popup or background to toggle.
 */
let debugEnabled = false;
export function enableDebug(): void {
  debugEnabled = true;
}
export function disableDebug(): void {
  debugEnabled = false;
}
export function isDebugEnabled(): boolean {
  return debugEnabled;
}
export function debug(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  if (debugEnabled) console.log(TAG, ...args);
}
