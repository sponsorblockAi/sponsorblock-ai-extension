import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'tests/e2e/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/inject.ts', // runs in page context, not testable in vitest
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
