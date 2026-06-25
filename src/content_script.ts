/**
 * Content script — extracts YouTube transcript.
 * Primary: reads from inject.js (intercepts timedtext XHR with pot token).
 * Fallback: DOM scraping.
 */

import type { TranscriptEntry, ProcessResult } from './types/global';
import { CONTENT_SCRIPT as CS_CONFIG } from './config';
import { log, debug, error } from './lib/logger';
import { t } from './lib/i18n';
import { logError } from './lib/error-log';
import { sleep } from './lib/sleep';

(function () {
  'use strict';

  // Inject page-context script
  (function () {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  })();

  let lastVideoID: string | null = null;
  let isProcessing = false;
  // Guard against double-injection of navigation hooks
  let navigationHooksInstalled = false;

  // ── Video ID extraction ──────────────────────────────────────────

  function getVideoID(): string | null {
    const params = new URLSearchParams(window.location.search);
    if (params.has('v')) return params.get('v');
    const m = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1]!;
    const m2 = window.location.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (m2) return m2[1]!;
    return null;
  }

  // ── Find and click "Show transcript" button ──────────────────────

  function findTranscriptButton(): Element | null {
    const labels = [
      'Show transcript',
      '显示字幕',
      '字幕を表示',
      '대본 보기',
      'Afficher la transcription',
      'Transkript anzeigen',
      'Mostrar transcripción',
      '转写文稿',
      '内容转文字',
      '显示转写文稿',
      'แสดงบทบรรยาย',
    ];
    for (const label of labels) {
      const btn = document.querySelector(`button[aria-label="${label}"]`);
      if (btn) return btn;
    }

    const textEls = document.querySelectorAll('yt-formatted-string');
    for (const el of textEls) {
      const txt = (el.textContent || '').toLowerCase();
      if (
        txt.includes('transcript') ||
        txt.includes('字幕') ||
        txt.includes('대본') ||
        txt.includes('转写') ||
        txt.includes('文字')
      ) {
        const btn = el.closest('button, tp-yt-paper-item, ytd-menu-service-item-renderer');
        if (btn) return btn;
      }
    }
    return null;
  }

  function expandDescription(): void {
    const expander = document.querySelector('#description-inline-expander button, #expand');
    if (expander && (expander as HTMLElement).offsetParent !== null) {
      (expander as HTMLElement).click();
    }
  }

  async function openTranscriptPanel(): Promise<boolean> {
    const segSel = 'transcript-segment-view-model, ytd-transcript-segment-renderer';
    if (document.querySelectorAll(segSel).length > 0) {
      debug('Transcript panel already open');
      return true;
    }

    expandDescription();
    await sleep(CS_CONFIG.PANEL_WAIT_MS);

    const btn = findTranscriptButton();
    if (!btn) {
      debug('Transcript button not found');
      return false;
    }

    (btn as HTMLElement).click();

    for (let i = 0; i < CS_CONFIG.PANEL_OPEN_RETRIES; i++) {
      await sleep(CS_CONFIG.PANEL_WAIT_MS);
      for (const sel of ['transcript-segment-view-model', 'ytd-transcript-segment-renderer']) {
        if (document.querySelectorAll(sel).length > 0) return true;
      }
    }
    return false;
  }

  async function scrapeTranscript(): Promise<TranscriptEntry[] | null> {
    const scrollbox = document.querySelector(
      '#transcript-scrollbox, [class*="transcript"] [class*="scroll"]',
    );
    if (scrollbox) {
      // Only scroll if the content exceeds the viewport
      const needsScroll = scrollbox.scrollHeight > scrollbox.clientHeight;
      if (needsScroll) {
        scrollbox.scrollTop = 0;
        const scrollStep = Math.min(CS_CONFIG.SCROLL_STEP_MAX, scrollbox.scrollHeight);
        const steps = Math.ceil(scrollbox.scrollHeight / scrollStep);
        for (let i = 0; i < steps; i++) {
          scrollbox.scrollTop += scrollStep;
          await sleep(CS_CONFIG.SCROLL_WAIT_MS);
        }
        scrollbox.scrollTop = 0;
        await sleep(300);
      }
    }

    let segs = document.querySelectorAll('transcript-segment-view-model');
    if (!segs.length) segs = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segs.length) return null;

    const entries: TranscriptEntry[] = [];
    for (const seg of segs) {
      const timeEl = seg.querySelector(
        '.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp, [class*="timestamp"]',
      );
      const textEl = seg.querySelector('span.ytAttributedStringHost, yt-formatted-string');
      const timeText = (timeEl?.textContent || '').trim();
      let text = (textEl?.textContent || '').trim();
      if (!text) {
        for (const span of seg.querySelectorAll('span')) {
          const t = span.textContent?.trim() || '';
          if (t.length > 5) {
            text = t;
            break;
          }
        }
      }
      if (!text) {
        const all = seg.textContent?.trim() || '';
        const m = all.match(/^(\d+:\d+(?::\d+)?)\s*(.*)/);
        text = m ? m[2]! : all;
      }
      if (!text) continue;

      let start = 0;
      if (timeText) {
        const parts = timeText.split(':');
        if (parts.length === 3) {
          start = parseInt(parts[0]!) * 3600 + parseInt(parts[1]!) * 60 + parseFloat(parts[2]!);
        } else if (parts.length === 2) {
          start = parseInt(parts[0]!) * 60 + parseFloat(parts[1]!);
        }
      }
      entries.push({ text, start, duration: 0 });
    }
    for (let i = 0; i < entries.length; i++) {
      entries[i]!.duration = i < entries.length - 1 ? entries[i + 1]!.start - entries[i]!.start : 5;
    }
    return entries.length ? entries : null;
  }

  // ── Status badge ─────────────────────────────────────────────────

  let badgeEl: HTMLDivElement | null = null;
  let badgeTimeout: number | undefined;
  let badgeSeq = 0; // monotonic sequence to prevent stale fades

  const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
    submitted: { bg: 'rgba(0,200,100,0.9)', fg: '#fff' },
    skip: { bg: 'rgba(255,255,255,0.2)', fg: '#ccc' },
    error: { bg: 'rgba(255,80,80,0.9)', fg: '#fff' },
    processing: { bg: 'rgba(0,160,255,0.9)', fg: '#fff' },
  };

  function showBadge(text: string, type: string): void {
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.id = 'sb-ai-badge';
      badgeEl.style.cssText =
        'position:fixed;bottom:80px;right:16px;z-index:9999;padding:6px 12px;border-radius:8px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none;transition:opacity 0.3s';
      document.body.appendChild(badgeEl);
    }
    const c = BADGE_COLORS[type] || { bg: 'rgba(255,255,255,0.2)', fg: '#ccc' };
    badgeEl.style.background = c.bg;
    badgeEl.style.color = c.fg;
    badgeEl.style.opacity = '1';
    badgeEl.textContent = text;

    // Use a sequence number so new messages cancel old fade timers
    const seq = ++badgeSeq;
    clearTimeout(badgeTimeout);
    badgeTimeout = window.setTimeout(() => {
      // Only fade if no newer message has arrived
      if (badgeSeq === seq) {
        badgeEl!.style.opacity = '0';
      }
    }, CS_CONFIG.BADGE_DISPLAY_MS);
  }

  // ── Read inject.js data ──────────────────────────────────────────

  function readInjectTranscript(videoID: string): TranscriptEntry[] | null {
    const el = document.getElementById('__sbai_data');
    if (!el || el.getAttribute('data-transcript-video') !== videoID) return null;
    const raw = el.getAttribute('data-transcript');
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as TranscriptEntry[];
    } catch {
      /* transcript not ready yet — normal */
    }
    return null;
  }

  function waitForInjectTranscript(
    videoID: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<TranscriptEntry[] | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      let done = false;
      let timerId: number | undefined;

      const finish = (v: TranscriptEntry[] | null) => {
        if (done) return;
        done = true;
        clearTimeout(timerId);
        document.removeEventListener('sbai-transcript-ready', onReady);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(v);
      };

      const onReady = () => finish(readInjectTranscript(videoID));

      const poll = () => {
        if (done) return;
        const t = readInjectTranscript(videoID);
        if (t) return finish(t);
        if (Date.now() - start > timeoutMs) return finish(null);
        timerId = window.setTimeout(poll, CS_CONFIG.TRANSCRIPT_POLL_INTERVAL_MS);
      };

      const onAbort = () => {
        finish(null);
      };

      if (signal) {
        if (signal.aborted) {
          resolve(null);
          return;
        }
        signal.addEventListener('abort', onAbort);
      }

      document.addEventListener('sbai-transcript-ready', onReady);
      poll();
    });
  }

  // ── Trigger SponsorBlock refresh via page reload ─────────────────

  function notifySponsorBlock(): void {
    // Cross-extension messaging doesn't work with SponsorBlock (no onMessageExternal).
    // The only reliable way to make SponsorBlock re-query segments is a page reload.
    // YouTube usually auto-resumes playback position on refresh.
    showBadge(t('badgeSubmitted'), 'submitted');
    setTimeout(() => location.reload(), CS_CONFIG.RELOAD_DELAY_MS);
  }

  // ── Main processing ──────────────────────────────────────────────

  // AbortController for cancelling in-flight processing when navigation happens
  let processingAbort: AbortController | null = null;

  async function processCurrentVideo(force = false): Promise<void> {
    if (isProcessing) return;
    const videoID = getVideoID();
    if (!videoID) return;
    if (!force && videoID === lastVideoID) return;

    // Cancel any previous in-flight processing
    if (processingAbort) {
      processingAbort.abort();
    }
    processingAbort = new AbortController();
    const signal = processingAbort.signal;

    isProcessing = true;

    try {
      // Strategy 1: inject.js API (complete data via XHR intercept)
      let transcript = await waitForInjectTranscript(
        videoID,
        CS_CONFIG.INJECT_TRANSCRIPT_TIMEOUT_MS,
        signal,
      );

      // Strategy 2: DOM scraping
      if (!transcript && !signal.aborted) {
        const opened = await openTranscriptPanel();
        if (opened && !signal.aborted) transcript = await scrapeTranscript();
      }

      if (signal.aborted) return;

      if (!transcript || transcript.length === 0) {
        lastVideoID = videoID;
        isProcessing = false;
        return;
      }

      log('Transcript: ' + transcript.length + ' entries');
      showBadge(force ? t('badgeReanalyzing') : t('badgeAnalyzing'), 'processing');

      const result: ProcessResult = await chrome.runtime.sendMessage({
        type: 'detectSponsors',
        videoID,
        transcript,
        force,
      });

      if (result.action === 'submitted') {
        showBadge('✓ ' + result.details, 'submitted');
        notifySponsorBlock();
      } else if (result.action === 'error') {
        showBadge('✗ ' + result.details, 'error');
      } else {
        showBadge(result.details, 'skip');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error('Content script error:', msg);
      void logError('Content script error', msg);
    } finally {
      lastVideoID = videoID;
      isProcessing = false;
    }
  }

  // ── Navigation detection ────────────────────────────────────────

  let lastUrl = location.href;

  function onNavigate(): void {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    const vid = getVideoID();
    if (vid && vid !== lastVideoID) {
      // SPA navigation: give YouTube a moment to load captions
      setTimeout(() => processCurrentVideo(), CS_CONFIG.NAVIGATION_DELAY_MS);
    }
  }

  function installNavigationHooks(): void {
    if (navigationHooksInstalled) return;
    navigationHooksInstalled = true;

    // YouTube's own navigation event
    document.addEventListener('yt-navigate-finish', onNavigate);

    // Intercept history.pushState / replaceState for SPA navigations
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      origPushState(...args);
      onNavigate();
    };
    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      origReplaceState(...args);
      onNavigate();
    };
    window.addEventListener('popstate', onNavigate);
  }

  installNavigationHooks();

  // Initial load
  function tryInitialProcess(): void {
    const vid = getVideoID();
    if (vid) {
      lastUrl = location.href;
      setTimeout(() => processCurrentVideo(), CS_CONFIG.NAVIGATION_DELAY_MS);
    }
  }
  if (document.readyState === 'complete') tryInitialProcess();
  else window.addEventListener('load', tryInitialProcess);

  // Listen for force-rescan command from popup
  chrome.runtime.onMessage.addListener((message: { type: string }) => {
    if (message.type === 'forceRescan') {
      void processCurrentVideo(true);
    }
  });
})();
