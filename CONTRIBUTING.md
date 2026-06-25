# Contributing to SponsorBlock AI

Thanks for your interest in contributing! This document will help you get started.

## Development Setup

```bash
git clone <repo-url>
cd sponsorblock-ai-extension
npm install
```

### Available Commands

```bash
npm run build          # Build to dist/
npm run typecheck      # TypeScript type checking
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier formatting
npm run format:check   # Prettier format check
npm run test           # Run tests
npm run test:watch     # Run tests in watch mode
```

### Loading the Extension Locally

1. Run `npm run build`
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `dist/` folder

## Project Structure

```
src/
├── types/global.d.ts        # Shared type definitions
├── lib/
│   ├── llm.ts               # LLM client (OpenAI-compatible API)
│   ├── sponsorblock.ts      # SponsorBlock API client
│   └── transcript.ts        # YouTube transcript extraction
├── background.ts            # Service worker (orchestrator)
├── content_script.ts        # Content script (injected into YouTube)
├── inject.ts                # Page-context script (XHR intercept)
├── popup/                   # Settings popup
├── manifest.json
└── icons/
tests/
├── llm.test.ts              # Unit tests for LLM parsing
├── llm-integration.test.js  # Integration scenarios
├── sponsorblock.test.js     # Cache & API logic tests
├── chrome-mock.js           # Chrome API mock helper
└── e2e/
    └── extension.spec.js    # Playwright E2E tests
```

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes, following the existing code style
3. Run `npm run typecheck && npm run lint && npm run format:check && npm run test` to verify
4. Write or update tests as needed
5. Update documentation if your changes affect user-facing behavior
6. Open a PR with a clear description of the changes and why they're needed

## Code Style

- TypeScript with strict type checking
- ESLint + Prettier for consistent formatting
- Follow existing patterns in the codebase
- Keep functions small and focused
- Write meaningful comments for non-obvious logic

## Questions?

Feel free to open an issue for discussion before making large changes.
