import { describe, it, expect, beforeEach } from 'vitest';
import { createChromeMock } from './chrome-mock.js';

// Import the pure function directly
import { parseSegments } from '../src/lib/llm';

describe('LLM response parsing (integration scenarios)', () => {
  it('handles real model output with "s" suffix', () => {
    const response =
      '[{"category": "interaction", "start": 297.0s, "end": 313.0s}, {"category": "interaction", "start": 1636.0s, "end": 1652.0s}]';
    const result = parseSegments(response);
    expect(result).toHaveLength(2);
    expect(result![0]!.start).toBe(297);
    expect(result![1]!.start).toBe(1636);
  });

  it('handles SSE-like response with blank lines', () => {
    const response = '\n\n\n\n\n[{"category": "sponsor", "start": 45.5, "end": 78.2}]';
    const result = parseSegments(response);
    expect(result).toHaveLength(1);
  });

  it('handles response with reasoning text mixed in', () => {
    const response = `I found the following segments:\n\n[{"category": "sponsor", "start": 10, "end": 20}]\n\nNo other segments detected.`;
    const result = parseSegments(response);
    expect(result).toHaveLength(1);
  });

  it('returns empty for no segments found', () => {
    const result = parseSegments('[]');
    expect(result).toEqual([]);
  });
});

describe('chrome.storage mock for LLM settings', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    chromeMock = createChromeMock();
  });

  it('retrieves LLM settings from storage', async () => {
    await chromeMock.storage.sync.set({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test123',
      model: 'test-model',
    });

    const settings = await chromeMock.storage.sync.get(['baseUrl', 'apiKey', 'model']);
    expect(settings.baseUrl).toBe('https://api.example.com');
    expect(settings.apiKey).toBe('sk-test123');
    expect(settings.model).toBe('test-model');
  });

  it('detects missing settings', async () => {
    const settings = await chromeMock.storage.sync.get(['baseUrl', 'apiKey', 'model']);
    expect(settings.apiKey).toBeUndefined();
  });
});
