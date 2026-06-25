/**
 * Background service worker — orchestrates the AI detection pipeline.
 *
 * Receives transcript from content script, checks SponsorBlock for existing
 * data, calls LLM if needed, and submits results back to SponsorBlock.
 */

import {
  getExistingSegments,
  submitSegments,
  getUserID,
  isRecentlyProcessed,
  markProcessed,
} from './lib/sponsorblock';
import { detectSegments } from './lib/llm';
import { warn, error, log } from './lib/logger';
import { t } from './lib/i18n';
import { logError } from './lib/error-log';
import type { TranscriptEntry, SponsorSegment, ProcessResult } from './types/global';

/** Helper: extract a human-readable error message from any thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Main handler: process a video for sponsor segments. Exported for testing. */
export async function processVideo(
  videoID: string,
  transcript: TranscriptEntry[],
  force = false,
): Promise<ProcessResult> {
  if (!force) {
    // Step 1: Check cache
    if (await isRecentlyProcessed(videoID)) {
      return { action: 'skip', details: t('resultAlreadyProcessed') };
    }

    // Step 2: Check if SponsorBlock already has segments
    try {
      const existing = await getExistingSegments(videoID);
      if (existing !== null && existing.length > 0) {
        await markProcessed(videoID);
        return {
          action: 'skip',
          details: t('resultAlreadyHasSegments', [String(existing.length)]),
        };
      }
    } catch (err) {
      warn('Failed to query SponsorBlock:', errorMessage(err));
      void logError('SponsorBlock query failed', errorMessage(err));
    }
  }

  // Step 3: Call LLM
  let segments: SponsorSegment[];
  let model: string;
  try {
    const result = await detectSegments(transcript);
    segments = result.segments;
    model = result.model;
  } catch (err) {
    error('LLM detection failed:', errorMessage(err));
    void logError('LLM detection failed', errorMessage(err));
    return { action: 'error', details: t('resultLlmError', [errorMessage(err)]) };
  }

  if (!segments || segments.length === 0) {
    await markProcessed(videoID);
    return { action: 'skip', details: t('resultNoSegments') };
  }

  // Step 4: Submit to SponsorBlock
  try {
    const userID = await getUserID();
    await submitSegments(videoID, userID, segments);
    log('Submitted', segments.length, 'segments for', videoID, 'via', model);
  } catch (err) {
    error('Failed to submit segments:', errorMessage(err));
    void logError('SponsorBlock submit failed', errorMessage(err));
    return {
      action: 'partial',
      details: t('resultSubmitFailed', [String(segments.length), errorMessage(err)]),
      segments,
    };
  }

  // Step 5: Mark processed
  await markProcessed(videoID);

  return {
    action: 'submitted',
    details: t('resultSubmitted', [String(segments.length), model]),
    segments,
  };
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; videoID: string; transcript: TranscriptEntry[]; force?: boolean },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ProcessResult) => void,
  ) => {
    if (message.type === 'detectSponsors') {
      const { videoID, transcript, force } = message;

      if (!videoID || !transcript || transcript.length === 0) {
        sendResponse({ action: 'error', details: t('resultNoTranscript') });
        return true;
      }

      processVideo(videoID, transcript, force)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err: unknown) => {
          error('Unexpected error:', errorMessage(err));
          sendResponse({ action: 'error', details: errorMessage(err) });
        });

      return true;
    }
  },
);
