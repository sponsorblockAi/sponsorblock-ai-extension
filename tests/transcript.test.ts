import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseJson3Transcript, parseXmlTranscript } from '../src/lib/transcript';

// DOMParser is not available in the default vitest environment (Node).
// Provide a minimal mock that supports parseFromString for XML.
beforeEach(() => {
  (globalThis as Record<string, unknown>).DOMParser = class {
    parseFromString(xml: string, _type: string) {
      // Return a minimal Document-like object for our parser
      return createMockDocument(xml);
    }
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).DOMParser;
});

/** Build a minimal DOM Document mock from an XML string. */
function createMockDocument(xml: string) {
  const textElements: Array<{ start: string; dur: string; textContent: string }> = [];
  const textRegex = /<text\s+([^>]*)>([^<]*)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = textRegex.exec(xml)) !== null) {
    const attrs = match[1] || '';
    const start = (attrs.match(/start="([^"]*)"/) || [])[1] || '0';
    const dur = (attrs.match(/dur="([^"]*)"/) || [])[1] || '0';
    const text = match[2] || '';
    textElements.push({ start, dur, textContent: text });
  }

  // Check for parsererror in the "XML"
  const hasParseError = !xml.includes('<text') && !xml.trim().startsWith('<?xml');

  return {
    querySelector(selector: string) {
      if (selector === 'parsererror') {
        return hasParseError ? {} : null;
      }
      return textElements[0] || null;
    },
    querySelectorAll(_selector: string) {
      return textElements.map((el) => ({
        getAttribute(name: string) {
          return name === 'start' ? el.start : name === 'dur' ? el.dur : null;
        },
        textContent: el.textContent,
      }));
    },
  };
}

describe('parseJson3Transcript', () => {
  it('parses valid JSON3 data with events and segs', () => {
    const data = {
      events: [
        {
          tStartMs: 5000,
          dDurationMs: 3000,
          segs: [{ utf8: 'Hello world' }],
        },
        {
          tStartMs: 10000,
          dDurationMs: 5000,
          segs: [{ utf8: 'This is a test' }, { utf8: ' continuation' }],
        },
      ],
    };

    const result = parseJson3Transcript(data);
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ text: 'Hello world', start: 5, duration: 3 });
    expect(result![1]).toEqual({
      text: 'This is a test continuation',
      start: 10,
      duration: 5,
    });
  });

  it('skips events without segs', () => {
    const data = {
      events: [
        { tStartMs: 5000, dDurationMs: 3000, segs: [{ utf8: 'Valid' }] },
        { tStartMs: 8000, dDurationMs: 2000 }, // no segs
        { tStartMs: 10000, dDurationMs: 4000, segs: [{ utf8: 'Also valid' }] },
      ],
    };

    const result = parseJson3Transcript(data);
    expect(result).toHaveLength(2);
  });

  it('skips events with empty text after join', () => {
    const data = {
      events: [{ tStartMs: 5000, dDurationMs: 3000, segs: [{ utf8: '' }] }],
    };

    const result = parseJson3Transcript(data);
    expect(result).toBeNull();
  });

  it('returns null for empty events array', () => {
    const result = parseJson3Transcript({ events: [] });
    expect(result).toBeNull();
  });

  it('handles missing events field gracefully', () => {
    const result = parseJson3Transcript({});
    expect(result).toBeNull();
  });

  it('falls back to seg tOffsetMs when dDurationMs is 0', () => {
    const data = {
      events: [
        {
          tStartMs: 5000,
          dDurationMs: 0,
          segs: [{ utf8: 'Text', tOffsetMs: 2500 }],
        },
      ],
    };

    const result = parseJson3Transcript(data);
    expect(result).toHaveLength(1);
    expect(result![0]!.duration).toBe(2.5);
  });

  it('handles null/undefined data gracefully', () => {
    const result = parseJson3Transcript(null);
    expect(result).toBeNull();
  });
});

describe('parseXmlTranscript', () => {
  it('parses valid YouTube timedtext XML', () => {
    // Note: YouTube's timedtext uses <text> elements, not <p> elements
    const youtubeXml = `<?xml version="1.0" encoding="utf-8" ?>
<timedtext>
  <text start="0" dur="5">Hello world</text>
  <text start="5" dur="4">Second line</text>
</timedtext>`;

    const result = parseXmlTranscript(youtubeXml);
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ text: 'Hello world', start: 0, duration: 5 });
    expect(result![1]).toEqual({ text: 'Second line', start: 5, duration: 4 });
  });

  it('skips text elements with empty content', () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
<timedtext>
  <text start="0" dur="5">Valid</text>
  <text start="5" dur="3"></text>
  <text start="8" dur="4">Also valid</text>
</timedtext>`;

    const result = parseXmlTranscript(xml);
    expect(result).toHaveLength(2);
  });

  it('returns null for malformed XML', () => {
    const result = parseXmlTranscript('not xml at all');
    expect(result).toBeNull();
  });

  it('returns null for empty input', () => {
    const result = parseXmlTranscript('');
    expect(result).toBeNull();
  });

  it('returns null when no text elements found', () => {
    const noTextXml = `<?xml version="1.0" encoding="utf-8" ?>
<timedtext>
  <body></body>
</timedtext>`;

    const result = parseXmlTranscript(noTextXml);
    expect(result).toBeNull();
  });
});
