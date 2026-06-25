/**
 * Central configuration — all tunable constants in one place.
 *
 * Grouped by module. Every value has a comment explaining what it controls.
 * Use `as const` to ensure these are treated as immutable literals.
 *
 * Import individually or by namespace:
 *   import { LLM, SPONSORBLOCK } from '../config';
 *   const timeout = LLM.FETCH_TIMEOUT_MS;
 */

// ── LLM client ────────────────────────────────────────────────────────

export const LLM = {
  /** Max characters of transcript text to send in the prompt (rough). */
  MAX_TRANSCRIPT_LENGTH: 32_000,

  /** Sampling temperature — keep low for deterministic segment detection. */
  TEMPERATURE: 0.1,

  /** Max output tokens — must be large enough to hold a full segment array. */
  MAX_TOKENS: 16_384,

  /** Fetch timeout in milliseconds. Aborts the request if the LLM API hangs. */
  FETCH_TIMEOUT_MS: 30_000,

  /** Max retries for transient network / 5xx errors. */
  MAX_NETWORK_RETRIES: 2,

  /** Base delay between network retries, doubled on each attempt (exponential backoff). */
  NETWORK_RETRY_BASE_DELAY_MS: 1_000,
} as const;

// ── SponsorBlock API ──────────────────────────────────────────────────

export const SPONSORBLOCK = {
  /** SponsorBlock public API base URL. */
  API_BASE: 'https://sponsor.ajay.app/api',

  /** Requests per minute — kept below the 30 req/min server limit. */
  RATE_LIMIT_PER_MINUTE: 25,

  /** Sliding window size for the token-bucket rate limiter (ms). */
  RATE_WINDOW_MS: 60_000,

  /** Max retries with exponential backoff for rate-limit (429) responses. */
  MAX_RATE_LIMIT_RETRIES: 2,

  /** How long a processed video stays in the "skip detection" cache. */
  CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours

  /** Age at which stale cache entries are pruned during markProcessed. */
  CACHE_PRUNE_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

// ── Content script ────────────────────────────────────────────────────

export const CONTENT_SCRIPT = {
  /** Poll interval while waiting for the inject script to populate transcript data. */
  TRANSCRIPT_POLL_INTERVAL_MS: 500,

  /** Max time to wait for the inject script before falling back to DOM scraping. */
  INJECT_TRANSCRIPT_TIMEOUT_MS: 10_000,

  /** How long the status badge stays visible before fading out. */
  BADGE_DISPLAY_MS: 6_000,

  /** Delay after SPA navigation before starting transcript detection. */
  NAVIGATION_DELAY_MS: 1_500,

  /** Delay before page reload (to let SponsorBlock extension pick up new segments). */
  RELOAD_DELAY_MS: 1_500,

  /** Max pixels to scroll per step when scraping the transcript panel. */
  SCROLL_STEP_MAX: 2_000,

  /** Wait time between scroll steps to let the virtual list re-render. */
  SCROLL_WAIT_MS: 150,

  /** Wait after clicking "Show transcript" before checking for segments. */
  PANEL_WAIT_MS: 500,

  /** Number of retries (× PANEL_WAIT_MS) when waiting for the transcript panel to open. */
  PANEL_OPEN_RETRIES: 15,
} as const;

// ── Transcript extraction ─────────────────────────────────────────────

export const TRANSCRIPT = {
  /** Timeout for the injected script that reads ytInitialPlayerResponse. */
  CAPTION_DATA_TIMEOUT_MS: 6_000,
} as const;

// ── Error log ─────────────────────────────────────────────────────────

export const ERROR_LOG = {
  /** Max number of error entries retained in storage. */
  MAX_ENTRIES: 50,
} as const;
