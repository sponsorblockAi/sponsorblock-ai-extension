# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Release packages could not be installed.** `vite-plugin-static-copy` v4 (pulled in by a dependency bump) nests every static file under `dist/src/`, so `manifest.json` was not at the extension root and Chrome rejected the zip with `Could not unzip extension for install`. Copy targets now strip the `src/` prefix, and a new `npm run verify:dist` — wired into CI and the release job — fails the build if the layout regresses.

### Changed

- **Upgrading no longer wipes your settings.** The extension ID is now pinned by a `key` in `manifest.json` instead of being derived from the folder the extension was loaded from, so extracting each new release into a new folder no longer creates a second, empty extension. Note: upgrading from `0.1.2` or earlier still resets settings once, because those builds had no `key` — re-enter them and remove the old card, since two installs would both run their content scripts on YouTube.
- No longer auto-reloads the YouTube page after submitting segments. A badge now tells you to refresh (or reopen the video) so SponsorBlock picks up the new data. Auto-reload interrupted playback, and SponsorBlock exposes no external API to trigger a refetch.

## [0.1.0] - Initial Release

### Added

- Auto-detect sponsor, self-promo, and interaction segments in YouTube videos using AI
- Support for any OpenAI-compatible API (OpenAI, OpenRouter, Ollama, LiteLLM, etc.)
- Submit detected segments to SponsorBlock database
- Auto-upvote submitted segments
- Bilingual UI (English / Simplified Chinese)
- Settings popup for configuring API endpoint, key, and model
- Video processing cache to avoid re-processing recently analyzed videos
- Transcript sampling for very long videos

[Unreleased]: https://github.com/sponsorblockAi/sponsorblock-ai-extension/compare/v0.1.3...HEAD
[0.1.0]: https://github.com/sponsorblockAi/sponsorblock-ai-extension/releases/tag/v0.1.0
