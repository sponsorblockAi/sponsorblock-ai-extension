/**
 * Transcript extraction module for YouTube.
 *
 * YouTube stores caption data in ytInitialPlayerResponse, which exists in the
 * page's JavaScript context — inaccessible to content scripts directly.
 * We inject a script into the page to read it and pass it back via DOM events.
 */

import type { TranscriptEntry, CaptionTrackData } from '../types/global';
import { TRANSCRIPT as TS_CONFIG } from '../config';

/** Extract transcript from the YouTube page. Returns entries or null if no captions available. */
export async function extractTranscript(): Promise<TranscriptEntry[] | null> {
  const captionData = await getCaptionTrackData();
  if (!captionData) return null;

  const transcript = await fetchAndParseTranscript(captionData.baseUrl);
  return transcript;
}

/**
 * Inject a script into the page context to read ytInitialPlayerResponse,
 * extract caption track info, and send it back via a custom DOM event.
 */
function getCaptionTrackData(): Promise<CaptionTrackData | null> {
  return new Promise((resolve) => {
    const eventId = 'sb-ai-caption-data-' + Math.random().toString(36).slice(2);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.eventId !== eventId) return;
      document.removeEventListener('sb-ai-caption-response', handler);
      script.remove();
      resolve((detail?.data as CaptionTrackData) ?? null);
    };

    document.addEventListener('sb-ai-caption-response', handler);

    const script = document.createElement('script');
    script.textContent = `
      (function() {
        const eventId = '${eventId}';
        try {
          const pr = window.ytInitialPlayerResponse;
          if (!pr || !pr.captions) {
            document.dispatchEvent(new CustomEvent('sb-ai-caption-response', {
              detail: { eventId, data: null }
            }));
            return;
          }
          const tracks = pr.captions.playerCaptionsTracklistRenderer?.captionTracks;
          if (!tracks || tracks.length === 0) {
            document.dispatchEvent(new CustomEvent('sb-ai-caption-response', {
              detail: { eventId, data: null }
            }));
            return;
          }
          // Prefer English, then user's language, then first available
          let track = tracks.find(t => t.languageCode === 'en') ||
                      tracks.find(t => t.languageCode === (pr.captions.playerCaptionsTracklistRenderer?.audioTracks?.[0]?.languageCode || '')) ||
                      tracks[0];
          // Prefer manual captions but fall back to ASR
          const manualTracks = tracks.filter(t => t.kind !== 'asr');
          const manualEn = manualTracks.find(t => t.languageCode === 'en');
          if (manualEn) track = manualEn;
          else if (manualTracks.length > 0) track = manualTracks[0];

          document.dispatchEvent(new CustomEvent('sb-ai-caption-response', {
            detail: {
              eventId,
              data: {
                baseUrl: track.baseUrl,
                languageCode: track.languageCode,
                kind: track.kind || 'manual'
              }
            }
          }));
        } catch (e) {
          document.dispatchEvent(new CustomEvent('sb-ai-caption-response', {
            detail: { eventId, data: null }
          }));
        }
      })();
    `;
    document.documentElement.appendChild(script);

    // Timeout after a few seconds (some YouTube pages load slowly)
    setTimeout(() => {
      document.removeEventListener('sb-ai-caption-response', handler);
      script.remove();
      resolve(null);
    }, TS_CONFIG.CAPTION_DATA_TIMEOUT_MS);
  });
}

/** Fetch the timedtext XML from YouTube's API and parse into entries. */
async function fetchAndParseTranscript(baseUrl: string): Promise<TranscriptEntry[] | null> {
  try {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('fmt', 'json3');

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const text = await response.text();

    // Try JSON3 format first
    if (url.searchParams.get('fmt') === 'json3') {
      try {
        const data: unknown = JSON.parse(text);
        return parseJson3Transcript(data);
      } catch {
        // Fall back to XML parsing
      }
    }

    return parseXmlTranscript(text);
  } catch {
    return null;
  }
}

/** Parse YouTube's json3 transcript format. Exported for testing.
 *
 * ⚠ CANONICAL IMPLEMENTATION — if you update this, keep `inject.ts` parseJson3() in sync.
 */
export function parseJson3Transcript(data: unknown): TranscriptEntry[] | null {
  const entries: TranscriptEntry[] = [];
  const d = data as {
    events?: {
      segs?: { utf8?: string; tOffsetMs?: number }[];
      tStartMs: number;
      dDurationMs?: number;
    }[];
  };
  const events = d?.events || [];

  for (const event of events) {
    if (!event.segs) continue;
    const text = event.segs
      .map((seg) => seg.utf8 || '')
      .join('')
      .trim();
    if (!text) continue;

    // Fall back through available duration sources
    const segDuration = event.segs[0]?.tOffsetMs ?? 0;

    entries.push({
      text,
      start: event.tStartMs / 1000,
      duration: (event.dDurationMs || segDuration || 0) / 1000,
    });
  }

  return entries.length > 0 ? entries : null;
}

/** Parse YouTube's XML timedtext format. Exported for testing. */
export function parseXmlTranscript(xmlText: string): TranscriptEntry[] | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  if (doc.querySelector('parsererror')) return null;

  const entries: TranscriptEntry[] = [];
  const textElements = doc.querySelectorAll('text');

  for (const el of textElements) {
    const start = parseFloat(el.getAttribute('start') || '0');
    const duration = parseFloat(el.getAttribute('dur') || '0');
    const text = (el.textContent || '').trim();
    if (!text) continue;

    entries.push({ text, start, duration });
  }

  return entries.length > 0 ? entries : null;
}
