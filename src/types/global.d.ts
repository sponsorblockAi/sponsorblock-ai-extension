/** A single transcript entry with timestamp and text. */
export interface TranscriptEntry {
  text: string;
  start: number;
  duration: number;
}

/** A detected sponsor segment ready for submission. */
export interface SponsorSegment {
  category: 'sponsor' | 'selfpromo' | 'interaction';
  start: number;
  end: number;
}

/** Result from processVideo — sent back to content script. */
export interface ProcessResult {
  action: 'skip' | 'submitted' | 'error' | 'partial';
  details: string;
  segments?: SponsorSegment[];
}

/** LLM detection result. */
export interface DetectionResult {
  segments: SponsorSegment[];
  model: string;
}

/** Caption track metadata extracted from ytInitialPlayerResponse. */
export interface CaptionTrackData {
  baseUrl: string;
  languageCode: string;
  kind: 'asr' | 'manual' | string;
}

/** LLM settings stored in chrome.storage.sync. */
export interface LLMSettings {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

/** Augment Window for inject script guard. */
declare global {
  interface Window {
    __sbai_inject_installed?: boolean;
  }
}
