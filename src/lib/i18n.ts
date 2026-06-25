/**
 * I18n helper — thin wrapper around chrome.i18n.getMessage().
 *
 * Usage:
 *   import { t } from './lib/i18n';
 *
 *   // Simple string
 *   t('errorSettingsNotConfigured')
 *
 *   // With substitutions (uses Chrome's $PLACEHOLDER$ syntax in messages.json)
 *   t('resultSubmitted', ['5', 'gpt-4o-mini'])
 */

export function t(key: string, substitutions?: string | string[]): string {
  // chrome.i18n.getMessage returns "" when key is missing.
  // We fall back to `[key]` to make missing translations obvious.
  return chrome.i18n.getMessage(key, substitutions) || `[${key}]`;
}
