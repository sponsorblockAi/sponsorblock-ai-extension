/**
 * Promise-based sleep helper.
 *
 * Used across the codebase for delays (retry backoff, transcript polling,
 * UI transitions, etc.). Extracted to avoid duplication.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
