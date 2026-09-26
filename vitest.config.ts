import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'tests/e2e/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        // Both run in the YouTube page context (DOM scraping / XHR interception),
        // not unit-testable in vitest — covered by the Playwright e2e suite instead.
        'src/inject.ts',
        'src/content_script.ts',
      ],
      thresholds: {
        // Prevent regression — fail CI if coverage drops below these levels
        statements: 60,
        branches: 65,
        functions: 60,
        lines: 60,
      },
    },
  },
});
