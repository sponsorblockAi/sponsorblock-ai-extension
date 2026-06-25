/**
 * SponsorBlock API client.
 *
 * Endpoints used:
 *   GET  /api/skipSegments?videoID=xxx   — query existing segments
 *   POST /api/skipSegments               — submit new segments
 *
 * The API is rate-limited (roughly 30 req/min). We use a simple
 * token-bucket throttler and exponential backoff to stay polite.
 */

import type { SponsorSegment } from '../types/global';
import { SPONSORBLOCK as SB_CONFIG } from '../config';
import { warn } from './logger';
import { t } from './i18n';

// ── Simple rate limiter (token bucket) ─────────────────────────────

let tokens: number = SB_CONFIG.RATE_LIMIT_PER_MINUTE;
let lastRefill = Date.now();

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRefill;
  // Refill tokens proportionally
  const refill = Math.floor((elapsed / SB_CONFIG.RATE_WINDOW_MS) * SB_CONFIG.RATE_LIMIT_PER_MINUTE);
  if (refill > 0) {
    tokens = Math.min(SB_CONFIG.RATE_LIMIT_PER_MINUTE, tokens + refill);
    lastRefill = now;
  }
  // Guard: tokens may dip below 0 under bursty load — clamp before calculating wait
  if (tokens <= 0) {
    const deficit = Math.max(0, 1 - tokens); // how many tokens we need before the next call
    const waitMs = Math.ceil(
      (deficit / SB_CONFIG.RATE_LIMIT_PER_MINUTE) * SB_CONFIG.RATE_WINDOW_MS,
    );
    await new Promise((r) => setTimeout(r, waitMs));
    // Refill after waiting, then retry
    const newElapsed = Date.now() - lastRefill;
    const newRefill = Math.floor(
      (newElapsed / SB_CONFIG.RATE_WINDOW_MS) * SB_CONFIG.RATE_LIMIT_PER_MINUTE,
    );
    tokens = Math.min(SB_CONFIG.RATE_LIMIT_PER_MINUTE, tokens + newRefill);
    lastRefill = Date.now();
    if (tokens <= 0) {
      // Still no tokens after waiting — force grant one to avoid deadlock
      tokens = 1;
    }
  }
  tokens--;
}

// ── Retry with exponential backoff ─────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = SB_CONFIG.MAX_RATE_LIMIT_RETRIES,
): Promise<Response> {
  await rateLimit();

  let attempt = 0;
  while (true) {
    const response = await fetch(url, options);
    // 429 Too Many Requests — back off and retry
    if (response.status === 429 && attempt < retries) {
      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
      warn(`SponsorBlock rate-limited, retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
      continue;
    }
    return response;
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Check if segments already exist for a video.
 * Returns the segment array if found, null if video has never been submitted.
 */
export async function getExistingSegments(videoID: string): Promise<unknown[] | null> {
  const url = `${SB_CONFIG.API_BASE}/skipSegments?videoID=${encodeURIComponent(videoID)}`;
  const response = await fetchWithRetry(url);

  // 404 = video never submitted to SponsorBlock
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(t('errorSponsorblockQuery', [String(response.status)]));
  }

  const segments: unknown = await response.json();
  return Array.isArray(segments) ? segments : [];
}

/**
 * Submit detected segments to SponsorBlock.
 */
export async function submitSegments(
  videoID: string,
  userID: string,
  segments: SponsorSegment[],
): Promise<{ UUID?: string }[]> {
  const body = {
    videoID,
    userID,
    userAgent: `SponsorBlock AI/${chrome.runtime.getManifest().version}`,
    segments: segments.map((s) => ({
      segment: [s.start, s.end] as [number, number],
      category: s.category || 'sponsor',
    })),
  };

  const response = await fetchWithRetry(`${SB_CONFIG.API_BASE}/skipSegments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(t('errorSponsorblockSubmit', [String(response.status), errorText]));
  }

  const result: { UUID?: string }[] = await response.json();

  // Auto-upvote submitted segments in parallel so they reach visibility threshold
  const votePromises = result
    .filter((seg) => !!seg.UUID)
    .map(async (seg) => {
      try {
        const params = new URLSearchParams({
          UUID: seg.UUID!,
          userID,
          videoID,
          type: '1', // 1 = upvote (0 = downvote, 20 = undo)
        });
        await fetchWithRetry(`${SB_CONFIG.API_BASE}/voteOnSponsorTime?${params.toString()}`, {
          method: 'POST',
        });
      } catch (e) {
        warn('Failed to vote on segment:', seg.UUID, e);
      }
    });

  await Promise.allSettled(votePromises);

  return result;
}

/**
 * Generate or retrieve a persistent SponsorBlock userID.
 * SponsorBlock uses randomly generated public IDs (not accounts).
 */
export async function getUserID(): Promise<string> {
  const result = await chrome.storage.local.get('sponsorblockUserID');
  if (result.sponsorblockUserID) {
    return result.sponsorblockUserID as string;
  }

  const userID = generatePublicUserID();
  await chrome.storage.local.set({ sponsorblockUserID: userID });
  return userID;
}

/** Generate a SponsorBlock-compatible public userID (30-char hex) using CSPRNG. */
function generatePublicUserID(): string {
  const chars = '0123456789abcdef';
  const values = new Uint8Array(30);
  crypto.getRandomValues(values);
  let id = '';
  for (let i = 0; i < values.length; i++) {
    id += chars[values[i]! % chars.length];
  }
  return id;
}

/**
 * Check if a video has already been processed (cached in local storage, 24h TTL).
 */
export async function isRecentlyProcessed(videoID: string): Promise<boolean> {
  const result = await chrome.storage.local.get('processedVideos');
  const cache = (result.processedVideos || {}) as Record<string, number>;
  const timestamp = cache[videoID];
  if (!timestamp) return false;

  return Date.now() - timestamp < SB_CONFIG.CACHE_TTL_MS;
}

/** Mark a video as processed, pruning entries older than 7 days. */
export async function markProcessed(videoID: string): Promise<void> {
  const result = await chrome.storage.local.get('processedVideos');
  const cache = (result.processedVideos || {}) as Record<string, number>;
  cache[videoID] = Date.now();

  // Prune entries older than 7 days to avoid unbounded growth
  for (const [key, ts] of Object.entries(cache)) {
    if (Date.now() - ts > SB_CONFIG.CACHE_PRUNE_AGE_MS) delete cache[key];
  }

  await chrome.storage.local.set({ processedVideos: cache });
}
