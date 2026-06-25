import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock, type ChromeMock } from './chrome-mock';
import type { SponsorSegment, TranscriptEntry } from '../src/types/global';

// We need to mock the dependencies BEFORE importing processVideo
// But for es module mocking we'll use a different approach — mock the
// imported modules and then dynamically import.

let chromeMock: ChromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  (globalThis as Record<string, unknown>).chrome = chromeMock;
  // Stub crypto.getRandomValues for Node environment (used by getUserID)
  try {
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    });
  } catch {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      },
      randomUUID: () => '',
      subtle: {},
    });
  }
});

afterEach(() => {
  chromeMock._reset();
  vi.restoreAllMocks();
});

// We test processVideo through its message listener pattern and
// by testing sub-scenarios via mock storage manipulation.

describe('processVideo — cache and existing segments', () => {
  it('skips when the video has already been processed recently', async () => {
    // Manually mark as processed directly in storage
    await chromeMock.storage.local.set({
      processedVideos: { video1: Date.now() },
    });

    // Import dynamically after mock setup
    const { processVideo } = await import('../src/background');
    const transcript: TranscriptEntry[] = [{ text: 'Hello', start: 0, duration: 5 }];

    const result = await processVideo('video1', transcript, false);
    expect(result.action).toBe('skip');
    expect(result.details).toContain('AlreadyProcessed');
  });

  it('skips when SponsorBlock already has segments for the video', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([{ segment: [10, 20], category: 'sponsor', UUID: 'abc' }]), {
        status: 200,
      }),
    );

    const { processVideo } = await import('../src/background');
    const transcript: TranscriptEntry[] = [{ text: 'Hello', start: 0, duration: 5 }];

    const result = await processVideo('video2', transcript, false);
    // Should skip because SponsorBlock already has segments
    expect(result.action).toBe('skip');
  });
});

describe('processVideo — LLM detection', () => {
  it('returns skip when LLM finds no segments', async () => {
    // Mock fetch for SponsorBlock query returning 404 (no existing segments)
    // And mock LLM returning empty segments...
    // We can't easily mock detectSegments internal fetch, so we mock chrome.storage
    // to have API settings and then mock fetch at a higher level.

    // First, set valid LLM settings
    await chromeMock.storage.sync.set({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      model: 'test-model',
    });

    // SponsorBlock query: 404 (no existing segments)
    vi.spyOn(globalThis, 'fetch')
      // SponsorBlock GET returns 404
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      // LLM call returns empty array
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '[]' } }],
          }),
          { status: 200 },
        ),
      );

    const { processVideo } = await import('../src/background');
    const transcript: TranscriptEntry[] = [{ text: 'Hello world', start: 0, duration: 5 }];

    const result = await processVideo('video3', transcript, false);
    expect(result.action).toBe('skip');
    expect(result.details).toContain('NoSegments');
  });

  it('submits segments when LLM finds sponsors', async () => {
    await chromeMock.storage.sync.set({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      model: 'test-model',
    });

    const segments: SponsorSegment[] = [{ category: 'sponsor', start: 10, end: 20 }];

    vi.spyOn(globalThis, 'fetch')
      // SponsorBlock GET (existing segments)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      // LLM call
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(segments) } }],
          }),
          { status: 200 },
        ),
      )
      // SponsorBlock POST (submit)
      .mockResolvedValueOnce(new Response(JSON.stringify([{ UUID: 'uuid-1' }]), { status: 200 }))
      // Vote
      .mockResolvedValueOnce(new Response('', { status: 200 }));

    const { processVideo } = await import('../src/background');
    const transcript: TranscriptEntry[] = [
      { text: 'Check out our sponsor!', start: 10, duration: 10 },
    ];

    const result = await processVideo('video4', transcript, false);
    expect(result.action).toBe('submitted');
    expect(result.segments).toBeDefined();
  });

  it('returns error when LLM call fails', async () => {
    await chromeMock.storage.sync.set({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      model: 'test-model',
    });

    vi.spyOn(globalThis, 'fetch')
      // SponsorBlock GET returns 404
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      // LLM call returns 500
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
      // LLM retry also returns 500
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
      // Third retry attempt
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

    const { processVideo } = await import('../src/background');
    const transcript: TranscriptEntry[] = [{ text: 'Hello', start: 0, duration: 5 }];

    const result = await processVideo('video5', transcript, false);
    expect(result.action).toBe('error');
  });
});

describe('processVideo — force mode', () => {
  it('bypasses cache and existing segment checks when force=true', async () => {
    // Pre-populate cache
    await chromeMock.storage.local.set({
      processedVideos: { video6: Date.now() },
    });

    // Pre-populate SponsorBlock segments
    vi.spyOn(globalThis, 'fetch')
      // SponsorBlock GET returns existing segments
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ segment: [10, 20], category: 'sponsor', UUID: 'abc' }]), {
          status: 200,
        }),
      );

    // With force=true, should NOT skip despite cache + existing segments
    // It will continue to LLM, but since we haven't set API keys,
    // it should error because of missing settings
    const { processVideo } = await import('../src/background');
    const transcript: TranscriptEntry[] = [{ text: 'Hello', start: 0, duration: 5 }];

    // Should not hit the cache/segment check branches when force=true
    // Instead goes to LLM which fails due to missing settings
    const result = await processVideo('video6', transcript, true);
    // Missing settings causes error
    expect(result.action).toBe('error');
  });
});

describe('processVideo — edge cases', () => {
  it('returns error when API settings are missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 404 }));

    const { processVideo } = await import('../src/background');
    const transcript: TranscriptEntry[] = [{ text: 'Hello', start: 0, duration: 5 }];

    const result = await processVideo('video_missing_settings', transcript, false);
    expect(result.action).toBe('error');
    expect(result.details).toBe('[resultLlmError]');
  });

  it('handles empty transcript gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 404 }));

    const { processVideo } = await import('../src/background');
    const result = await processVideo('video_empty', [], false);
    // Empty transcript should result in error (cannot call LLM without content)
    expect(result.action).toBe('error');
  });
});
