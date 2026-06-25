/**
 * LLM client — OpenAI-compatible API.
 *
 * Sends transcript + detection prompt to the configured LLM and parses
 * the response into SponsorBlock-compatible segment format.
 */

import type {
  TranscriptEntry,
  SponsorSegment,
  DetectionResult,
  LLMSettings,
} from '../types/global';
import { LLM as LLM_CONFIG } from '../config';
import { warn } from './logger';
import { t } from './i18n';
import { sleep } from './sleep';

const SYSTEM_PROMPT = `You are a YouTube video segment detector. Your job is to analyze video transcripts and identify segments that should be skipped.

Categories to detect:
- "sponsor": Paid promotions, sponsorship messages, ad reads. Look for phrases like "thanks to our sponsor", "this video is sponsored by", "use my code for X% off", "check out this product at the link below".
- "selfpromo": Self-promotion of the creator's own products, merchandise, Patreon, courses, other channels, or websites. Look for phrases like "check out my merch", "join my Patreon", "subscribe to my second channel".
- "interaction": Engagement prompts like "like, comment, subscribe", "hit the bell", reminders to interact.

Rules:
1. Only mark segments where the speaker is actively promoting/sponsoring/requesting engagement. Casual mentions or jokes are NOT segments.
2. Use the transcript timestamps to determine precise start and end times.
3. If no segments are found, return an empty array.
4. Adjacent segments of the same category should be merged into one.
5. Each segment should typically be 5-60 seconds long. If something is just one line (1-2 seconds), it's probably not a real segment.

Return ONLY valid JSON in this exact format, nothing else:
[{"category": "sponsor", "start": 45.5, "end": 78.2}, {"category": "interaction", "start": 120.0, "end": 128.0}]`;

/** Build the user message with the transcript. */
function buildUserMessage(transcript: TranscriptEntry[]): string {
  const lines = transcript.map((t) => `[${t.start.toFixed(1)}s] ${t.text}`).join('\n');

  return `Analyze this YouTube video transcript and identify sponsor, self-promo, and interaction segments.\n\nTranscript:\n${lines}`;
}

/**
 * Parse and validate the LLM's JSON response.
 * Handles common issues: markdown code fences, trailing commas, extra text.
 * Returns null if the input is completely malformed.
 */
export function parseSegments(raw: string): SponsorSegment[] | null {
  let json = raw.trim();

  // Strip SSE "data: " prefix lines
  json = json.replace(/^data:\s*/gm, '');

  // Remove markdown code fences
  json = json.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

  // Try to find JSON array if there's extra text
  const arrayMatch = json.match(/\[\s*\{.*\}\s*\]/s);
  if (arrayMatch) {
    json = arrayMatch[0];
  }

  // Fix common LLM formatting error: trailing 's' after numbers (e.g. 297.0s)
  json = json.replace(/(\d+\.?\d*)s(\s*[,}\]])/g, '$1$2');
  json = json.replace(/(\d+\.?\d*)s(\s*$)/g, '$1$2');

  let segments: unknown[];
  try {
    segments = JSON.parse(json);
  } catch {
    return null;
  }

  if (!Array.isArray(segments)) return null;

  // Validate and clean each segment
  const valid: SponsorSegment[] = [];
  for (const seg of segments) {
    if (typeof seg !== 'object' || seg === null) continue;
    const s = seg as Record<string, unknown>;
    const category = String(s.category ?? '').toLowerCase();
    if (!['sponsor', 'selfpromo', 'interaction'].includes(category)) {
      warn('Skipping segment with invalid category:', s.category);
      continue;
    }

    const start = parseFloat(String(s.start ?? ''));
    const end = parseFloat(String(s.end ?? ''));
    if (isNaN(start) || isNaN(end)) {
      warn('Skipping segment with non-numeric start/end:', { start: s.start, end: s.end });
      continue;
    }
    if (start >= end) {
      warn('Skipping segment with start >= end:', { category, start, end });
      continue;
    }
    if (end - start < 2) {
      warn('Skipping segment too short (< 2s):', { category, start, end, duration: end - start });
      continue;
    }
    if (end - start > 360) {
      warn('Skipping segment too long (> 360s):', { category, start, end, duration: end - start });
      continue;
    }

    valid.push({
      category: category as SponsorSegment['category'],
      start: Math.round(start * 10) / 10,
      end: Math.round(end * 10) / 10,
    });
  }

  return mergeSegments(valid);
}

/** Merge overlapping or adjacent segments of the same category. */
export function mergeSegments(segments: SponsorSegment[]): SponsorSegment[] {
  if (segments.length <= 1) return segments;

  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: SponsorSegment[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = sorted[i]!;

    if (curr.category === prev.category && curr.start <= prev.end + 2) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

/**
 * Sample the transcript evenly if it exceeds the max length.
 * Guarantees at least 2 entries (first + last) even for extreme inputs.
 */
export function sampleTranscript(
  transcript: TranscriptEntry[],
  maxLength: number,
): TranscriptEntry[] {
  const msg = buildUserMessage(transcript);
  if (msg.length <= maxLength) return transcript;

  const targetCount = Math.floor(transcript.length * (maxLength / msg.length));
  const stride = Math.max(2, Math.ceil(transcript.length / Math.max(targetCount, 2)));

  const sampled = transcript.filter((_, i) => i % stride === 0);

  // Always include the last entry (may contain crucial end-of-video info)
  if (sampled.length > 0 && sampled[sampled.length - 1] !== transcript[transcript.length - 1]) {
    sampled.push(transcript[transcript.length - 1]!);
  }

  return sampled;
}

/** Detect sponsor segments by calling the configured LLM. */
export async function detectSegments(
  transcript: TranscriptEntry[],
  settingsOverride?: LLMSettings,
): Promise<DetectionResult> {
  const settings =
    settingsOverride ??
    ((await chrome.storage.sync.get(['baseUrl', 'apiKey', 'model'])) as LLMSettings);
  if (!settings.apiKey || !settings.baseUrl || !settings.model) {
    throw new Error(t('errorSettingsNotConfigured'));
  }

  const { baseUrl, apiKey, model } = settings;

  // Sample transcript if needed, with safety floor
  const workingTranscript = sampleTranscript(transcript, LLM_CONFIG.MAX_TRANSCRIPT_LENGTH);

  const originalMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserMessage(workingTranscript) },
  ];

  // First attempt
  let segments = await callLLM(baseUrl, apiKey, model, originalMessages);

  // If malformed, retry once with original context + stricter instruction
  if (!segments) {
    const retryMessages = [
      ...originalMessages,
      {
        role: 'user' as const,
        content:
          'Your previous response was not valid JSON. Please analyze the transcript above again and return ONLY a JSON array: [{"category": "...", "start": number, "end": number}]. Do not include any other text.',
      },
    ];
    segments = await callLLM(baseUrl, apiKey, model, retryMessages);
  }

  return {
    segments: segments || [],
    model,
  };
}

/** Make the actual API call to the OpenAI-compatible endpoint. */
async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<SponsorSegment[] | null> {
  let normalizedUrl = baseUrl.replace(/\/+$/, '');
  if (!normalizedUrl.endsWith('/v1')) {
    normalizedUrl += '/v1';
  }
  const endpoint = `${normalizedUrl}/chat/completions`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= LLM_CONFIG.MAX_NETWORK_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_CONFIG.FETCH_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: LLM_CONFIG.TEMPERATURE,
            max_tokens: LLM_CONFIG.MAX_TOKENS,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errorMsg = t('errorLlmApi', [String(response.status), errorText]);

        // Retry on server errors (5xx)
        if (response.status >= 500 && attempt < LLM_CONFIG.MAX_NETWORK_RETRIES) {
          lastError = new Error(errorMsg);
          const delay = LLM_CONFIG.NETWORK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          warn(`LLM API 5xx error, retrying in ${delay}ms (attempt ${attempt + 1})`);
          await sleep(delay);
          continue;
        }

        throw new Error(errorMsg);
      }

      const data: { choices?: { message?: { content?: string } }[] } = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;

      return parseSegments(content);
    } catch (err) {
      // Don't retry on abort (timeout) or parse errors — let them propagate
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(t('errorLlmTimeout'));
      }
      // Don't retry Errors that were already thrown above (non-retryable status codes)
      if (err instanceof Error && err.message !== '' && !lastError) {
        throw err;
      }
      // Network error (fetch threw)
      if (attempt < LLM_CONFIG.MAX_NETWORK_RETRIES) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const delay = LLM_CONFIG.NETWORK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        warn(
          `LLM network error, retrying in ${delay}ms (attempt ${attempt + 1}):`,
          lastError.message,
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error('LLM request failed');
}
