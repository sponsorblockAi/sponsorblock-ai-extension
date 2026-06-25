import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    // Load extension as unpacked
    launchOptions: {
      args: ['--disable-extensions-except=${EXTENSION_PATH}', '--load-extension=${EXTENSION_PATH}'],
    },
    // Accept permissions dialog
    permissions: [],
  },
  // Only test with Chromium (extensions only work in Chromium)
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
