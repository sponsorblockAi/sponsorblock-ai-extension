import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock, type ChromeMock } from './chrome-mock';
import {
  isRecentlyProcessed,
  markProcessed,
  getUserID,
  getExistingSegments,
  submitSegments,
} from '../src/lib/sponsorblock';
import { SPONSORBLOCK as SB_CONFIG } from '../src/config';
import type { SponsorSegment } from '../src/types/global';

let chromeMock: ChromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  (globalThis as Record<string, unknown>).chrome = chromeMock;
  // Stub crypto.getRandomValues for Node environment
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  });
});

afterEach(() => {
  chromeMock._reset();
  vi.restoreAllMocks();
});

// ── Cache (isRecentlyProcessed / markProcessed) ───────────────────

describe('isRecentlyProcessed', () => {
  it('returns false for a video not in cache', async () => {
    const result = await isRecentlyProcessed('video1');
    expect(result).toBe(false);
  });

  it('returns true for a recently cached video', async () => {
    await chromeMock.storage.local.set({
      processedVideos: { video1: Date.now() },
    });
    const result = await isRecentlyProcessed('video1');
    expect(result).toBe(true);
  });

  it('returns false when cache TTL has expired', async () => {
    const expired = Date.now() - SB_CONFIG.CACHE_TTL_MS - 1;
    await chromeMock.storage.local.set({
      processedVideos: { video1: expired },
    });
    const result = await isRecentlyProcessed('video1');
    expect(result).toBe(false);
  });
});

describe('markProcessed', () => {
  it('sets a timestamp for the video', async () => {
    await markProcessed('video1');
    const result = await isRecentlyProcessed('video1');
    expect(result).toBe(true);
  });

  it('prunes entries older than 7 days', async () => {
    const weekAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await chromeMock.storage.local.set({
      processedVideos: { oldVideo: weekAgo },
    });
    await markProcessed('newVideo');

    const isOldCached = await isRecentlyProcessed('oldVideo');
    expect(isOldCached).toBe(false);

    // oldVideo key should be gone entirely
    const store = await chromeMock.storage.local.get('processedVideos');
    const cache = store.processedVideos as Record<string, number>;
    expect(cache.oldVideo).toBeUndefined();
    expect(cache.newVideo).toBeDefined();
  });
});

// ── User ID ───────────────────────────────────────────────────────

describe('getUserID', () => {
  it('generates a 30-char hex string', async () => {
    const userID = await getUserID();
    expect(userID).toHaveLength(30);
    expect(userID).toMatch(/^[0-9a-f]{30}$/);
  });

  it('returns the same ID on subsequent calls', async () => {
    const id1 = await getUserID();
    const id2 = await getUserID();
    expect(id1).toBe(id2);
  });
});

// ── getExistingSegments ───────────────────────────────────────────

describe('getExistingSegments', () => {
  it('returns null when API responds 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await getExistingSegments('video1');
    expect(result).toBeNull();
  });

  it('returns segment array on valid response', async () => {
    const mockSegments = [{ segment: [10, 20], category: 'sponsor', UUID: 'abc' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockSegments), { status: 200 }),
    );
    const result = await getExistingSegments('video1');
    expect(result).toEqual(mockSegments);
  });

  it('throws on server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );
    await expect(getExistingSegments('video1')).rejects.toThrow();
  });
});

// ── submitSegments ────────────────────────────────────────────────

describe('submitSegments', () => {
  it('builds correct request body and submits', async () => {
    vi.spyOn(globalThis, 'fetch')
      // POST submit
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ UUID: 'uuid-1' }, { UUID: 'uuid-2' }]), {
          status: 200,
        }),
      )
      // vote call 1
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      // vote call 2
      .mockResolvedValueOnce(new Response('', { status: 200 }));

    const segments: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'interaction', start: 30, end: 35 },
    ];

    const results = await submitSegments('video1', 'user123', segments);
    expect(results).toHaveLength(2);

    // Verify the POST body
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const submitBody = JSON.parse(calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(submitBody.videoID).toBe('video1');
    expect(submitBody.userID).toBe('user123');
    expect(submitBody.userAgent).toContain('SponsorBlock AI');
    expect(submitBody.segments as unknown[]).toHaveLength(2);
  });

  it('throws on submission failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Bad Request', { status: 400 }),
    );
    const segments: SponsorSegment[] = [{ category: 'sponsor', start: 10, end: 20 }];
    await expect(submitSegments('video1', 'user123', segments)).rejects.toThrow();
  });

  it('returns empty array for empty segments', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const results = await submitSegments('video1', 'user123', []);
    expect(results).toEqual([]);
  });

  it('handles vote failure gracefully (fire-and-forget)', async () => {
    vi.spyOn(globalThis, 'fetch')
      // POST submit succeeds
      .mockResolvedValueOnce(new Response(JSON.stringify([{ UUID: 'uuid-1' }]), { status: 200 }))
      // Vote fails — should not throw
      .mockRejectedValueOnce(new Error('Network error during vote'));

    const segments: SponsorSegment[] = [{ category: 'sponsor', start: 10, end: 20 }];
    // Should still return the submission result even if vote fails
    const results = await submitSegments('video1', 'user123', segments);
    expect(results).toHaveLength(1);
  });
});

// ── fetchWithRetry (via getExistingSegments) ───────────────────────

describe('getExistingSegments — retry behavior', () => {
  it('retries on 429 with exponential backoff', async () => {
    vi.useFakeTimers();

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const promise = getExistingSegments('video1');

    // Fast-forward through all retry delays
    await vi.runAllTimersAsync();

    // After retries, the 404 means no segments exist
    const result = await promise;
    expect(result).toBeNull();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  }, 10000);

  it('throws after exhausting retries on 5xx', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    // After MAX_RETRIES + 1 attempts (3 total), should throw
    await expect(getExistingSegments('video1')).rejects.toThrow();
  }, 10000);
});
