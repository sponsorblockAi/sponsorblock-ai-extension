import { describe, it, expect } from 'vitest';
import { parseSegments, mergeSegments, sampleTranscript } from '../src/lib/llm';
import type { SponsorSegment, TranscriptEntry } from '../src/types/global';

describe('parseSegments', () => {
  it('parses valid JSON array', () => {
    const raw = '[{"category": "sponsor", "start": 45.5, "end": 78.2}]';
    const result = parseSegments(raw);
    expect(result).toEqual([{ category: 'sponsor', start: 45.5, end: 78.2 }]);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n[{"category": "interaction", "start": 10, "end": 15}]\n```';
    const result = parseSegments(raw);
    expect(result).toEqual([{ category: 'interaction', start: 10, end: 15 }]);
  });

  it('strips markdown code fences without language specifier', () => {
    const raw = '```\n[{"category": "sponsor", "start": 5, "end": 12}]\n```';
    const result = parseSegments(raw);
    expect(result).toEqual([{ category: 'sponsor', start: 5, end: 12 }]);
  });

  it('handles extra text around JSON array', () => {
    const raw =
      'Here is the result:\n[{"category": "selfpromo", "start": 20, "end": 30}]\nHope this helps!';
    const result = parseSegments(raw);
    expect(result).toEqual([{ category: 'selfpromo', start: 20, end: 30 }]);
  });

  it('fixes trailing "s" after numbers (model formatting error)', () => {
    const raw = '[{"category": "interaction", "start": 297.0s, "end": 313.0s}]';
    const result = parseSegments(raw);
    expect(result).toEqual([{ category: 'interaction', start: 297, end: 313 }]);
  });

  it('fixes trailing "s" before comma', () => {
    const raw = '[{"category": "sponsor", "start": 10.5s, "end": 30.0s}]';
    const result = parseSegments(raw);
    expect(result).toEqual([{ category: 'sponsor', start: 10.5, end: 30 }]);
  });

  it('strips SSE data prefix', () => {
    const raw = 'data: [{"category": "sponsor", "start": 10, "end": 20}]';
    const result = parseSegments(raw);
    expect(result).toEqual([{ category: 'sponsor', start: 10, end: 20 }]);
  });

  it('rejects segments with duration < 2s', () => {
    const raw = '[{"category": "sponsor", "start": 10, "end": 11.5}]';
    const result = parseSegments(raw);
    expect(result).toEqual([] as SponsorSegment[]);
  });

  it('rejects segments with duration > 360s', () => {
    const raw = '[{"category": "sponsor", "start": 10, "end": 380}]';
    const result = parseSegments(raw);
    expect(result).toEqual([] as SponsorSegment[]);
  });

  it('rejects segments with end <= start', () => {
    const raw = '[{"category": "sponsor", "start": 30, "end": 25}]';
    const result = parseSegments(raw);
    expect(result).toEqual([] as SponsorSegment[]);
  });

  it('rejects segments with zero duration', () => {
    const raw = '[{"category": "sponsor", "start": 10, "end": 10}]';
    const result = parseSegments(raw);
    expect(result).toEqual([] as SponsorSegment[]);
  });

  it('rejects non-numeric start values', () => {
    const raw = '[{"category": "sponsor", "start": "abc", "end": 20}]';
    const result = parseSegments(raw);
    expect(result).toEqual([] as SponsorSegment[]);
  });

  it('rejects non-numeric end values', () => {
    const raw = '[{"category": "sponsor", "start": 10, "end": null}]';
    const result = parseSegments(raw);
    expect(result).toEqual([] as SponsorSegment[]);
  });

  it('filters invalid categories', () => {
    const raw = '[{"category": "music", "start": 10, "end": 20}]';
    const result = parseSegments(raw);
    expect(result).toEqual([] as SponsorSegment[]);
  });

  it('filters mixed valid and invalid segments', () => {
    const raw =
      '[{"category": "sponsor", "start": 10, "end": 20}, {"category": "music", "start": 30, "end": 40}]';
    const result = parseSegments(raw);
    expect(result).toHaveLength(1);
    expect(result![0]!.category).toBe('sponsor');
  });

  it('returns null for completely malformed input', () => {
    const raw = 'not json at all';
    const result = parseSegments(raw);
    expect(result).toBeNull();
  });

  it('returns null for non-array JSON', () => {
    const raw = '{"category": "sponsor", "start": 10, "end": 20}';
    const result = parseSegments(raw);
    expect(result).toBeNull();
  });

  it('skips null entries in array', () => {
    const raw =
      '[{"category": "sponsor", "start": 10, "end": 20}, null, {"category": "interaction", "start": 30, "end": 35}]';
    const result = parseSegments(raw);
    expect(result).toHaveLength(2);
  });

  it('handles multiple segments', () => {
    const raw =
      '[{"category": "sponsor", "start": 10, "end": 20}, {"category": "interaction", "start": 30, "end": 35}]';
    const result = parseSegments(raw);
    expect(result).toHaveLength(2);
  });

  it('rounds start and end to 1 decimal place', () => {
    const raw = '[{"category": "sponsor", "start": 10.12345, "end": 20.6789}]';
    const result = parseSegments(raw);
    expect(result![0]!.start).toBe(10.1);
    expect(result![0]!.end).toBe(20.7);
  });

  it('handles empty array input', () => {
    const result = parseSegments('[]');
    expect(result).toEqual([]);
  });

  it('trims whitespace before parsing', () => {
    const raw = '  \n  [{"category": "sponsor", "start": 10, "end": 20}]  \n  ';
    const result = parseSegments(raw);
    expect(result).toHaveLength(1);
  });
});

describe('mergeSegments', () => {
  it('returns single segment as-is', () => {
    const input: SponsorSegment[] = [{ category: 'sponsor', start: 10, end: 20 }];
    expect(mergeSegments(input)).toEqual(input);
  });

  it('returns empty array as-is', () => {
    expect(mergeSegments([])).toEqual([]);
  });

  it('merges adjacent same-category segments', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'sponsor', start: 22, end: 30 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ category: 'sponsor', start: 10, end: 30 });
  });

  it('merges overlapping same-category segments', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 25 },
      { category: 'sponsor', start: 20, end: 40 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ category: 'sponsor', start: 10, end: 40 });
  });

  it('merges segments with gap exactly 2s', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'sponsor', start: 22, end: 30 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(1);
  });

  it('does not merge segments with gap > 2s', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'sponsor', start: 23, end: 30 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(2);
  });

  it('does not merge different categories', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'interaction', start: 22, end: 30 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(2);
  });

  it('sorts by start time before merging', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 30, end: 40 },
      { category: 'sponsor', start: 10, end: 20 },
    ];
    const result = mergeSegments(input);
    expect(result).toEqual([
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'sponsor', start: 30, end: 40 },
    ]);
  });

  it('does not mutate the input array', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 30, end: 40 },
      { category: 'sponsor', start: 10, end: 20 },
    ];
    const original = JSON.parse(JSON.stringify(input)) as SponsorSegment[];
    mergeSegments(input);
    expect(input).toEqual(original);
  });

  it('handles chain of mergeable segments', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'sponsor', start: 21, end: 30 },
      { category: 'sponsor', start: 31, end: 40 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ category: 'sponsor', start: 10, end: 40 });
  });
});

describe('sampleTranscript', () => {
  function makeTranscript(count: number): TranscriptEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      text: `Entry ${i} with some text to add length`,
      start: i * 5,
      duration: 5,
    }));
  }

  it('returns all entries when under the max length', () => {
    const entries = makeTranscript(5);
    const result = sampleTranscript(entries, 100_000);
    expect(result).toEqual(entries);
  });

  it('returns fewer entries when over the max length', () => {
    const entries = makeTranscript(500);
    const result = sampleTranscript(entries, 5000);
    expect(result.length).toBeLessThan(entries.length);
  });

  it('always includes the last entry', () => {
    const entries = makeTranscript(200);
    const result = sampleTranscript(entries, 1000);
    expect(result[result.length - 1]).toBe(entries[entries.length - 1]);
  });

  it('always includes at least first and last entries', () => {
    const entries = makeTranscript(100);
    const result = sampleTranscript(entries, 100);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('handles single entry', () => {
    const entries = makeTranscript(1);
    const result = sampleTranscript(entries, 10);
    expect(result).toEqual(entries);
  });

  it('does not duplicate last entry if already sampled', () => {
    // With stride that includes the last entry, it should not appear twice
    const entries = makeTranscript(10);
    const result = sampleTranscript(entries, 200);
    // Count occurrences of the last entry
    const lastEntryCount = result.filter((e) => e === entries[entries.length - 1]).length;
    expect(lastEntryCount).toBe(1);
  });
});

describe('mergeSegments', () => {
  it('returns single segment as-is', () => {
    const input: SponsorSegment[] = [{ category: 'sponsor', start: 10, end: 20 }];
    expect(mergeSegments(input)).toEqual(input);
  });

  it('merges adjacent same-category segments', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'sponsor', start: 22, end: 30 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ category: 'sponsor', start: 10, end: 30 });
  });

  it('does not merge different categories', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'interaction', start: 22, end: 30 },
    ];
    const result = mergeSegments(input);
    expect(result).toHaveLength(2);
  });

  it('sorts by start time before merging', () => {
    const input: SponsorSegment[] = [
      { category: 'sponsor', start: 30, end: 40 },
      { category: 'sponsor', start: 10, end: 20 },
    ];
    const result = mergeSegments(input);
    expect(result).toEqual([
      { category: 'sponsor', start: 10, end: 20 },
      { category: 'sponsor', start: 30, end: 40 },
    ]);
  });
});
