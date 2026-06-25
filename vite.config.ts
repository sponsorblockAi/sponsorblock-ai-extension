import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

/**
 * Multi-pass build for Chrome extension:
 *
 *   BUILD_TARGET=module      → ES module output for background + popup
 *   BUILD_TARGET=iife-cs     → IIFE output for content_script (single entry)
 *   BUILD_TARGET=iife-inject → IIFE output for inject (single entry)
 *
 * IIFE entries must be built one-at-a-time because Rollup does not
 * support IIFE format for code-splitting (multi-entry) builds.
 *
 * The build script runs `clean` (prebuild) before the three passes,
 * so we don't need emptyOutDir here — it avoids stale files from
 * a prior failed partial build.
 */
type BuildTarget = 'module' | 'iife-cs' | 'iife-inject';

const TARGET = (process.env['BUILD_TARGET'] || 'module') as BuildTarget;
const isModule = TARGET === 'module';

// Each IIFE target maps to a single entry file
const IIFE_ENTRIES: Record<BuildTarget, string> = {
  module: '', // unused — module build uses its own input map
  'iife-cs': 'src/content_script.ts',
  'iife-inject': 'src/inject.ts',
};

const iifeEntry = IIFE_ENTRIES[TARGET];
if (!isModule && !iifeEntry) {
  throw new Error(`Unknown BUILD_TARGET: ${TARGET}`);
}

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/manifest.json', dest: '.' },
        { src: 'src/popup/popup.html', dest: 'popup' },
        { src: 'src/popup/popup.css', dest: 'popup' },
        { src: 'src/icons/*', dest: 'icons' },
        { src: 'src/_locales', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: false, // prebuild script handles cleaning
    minify: true,
    rollupOptions: {
      input: isModule
        ? {
            background: resolve(__dirname, 'src/background.ts'),
            'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
          }
        : iifeEntry!,
      output: {
        format: isModule ? 'es' : 'iife',
        entryFileNames: '[name].js',
        // For IIFE builds, prevent code-splitting
        ...(isModule ? {} : { inlineDynamicImports: true }),
      },
    },
  },
});
