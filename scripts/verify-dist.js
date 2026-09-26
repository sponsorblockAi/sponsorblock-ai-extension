/**
 * verify-dist.js — Asserts the built `dist/` is loadable as an unpacked extension.
 *
 * Chrome requires manifest.json at the extension root, and every file the
 * manifest points at has to be there too. A build-tool upgrade once nested
 * everything under dist/src/, which produced a zip that Chrome refused to
 * install ("Could not unzip extension for install"). `npm run build` alone
 * cannot catch that, so this runs after every build in CI and on release.
 *
 * Usage: node scripts/verify-dist.js
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

const errors = [];

const manifestPath = join(dist, 'manifest.json');
if (!existsSync(manifestPath)) {
  errors.push(
    `dist/manifest.json is missing — Chrome needs manifest.json at the extension root ` +
      `(found: ${existsSync(dist) ? readdirSync(dist).join(', ') || 'empty dist/' : 'no dist/ at all'})`,
  );
  report();
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Every path the browser is told to load, paired with where it was declared.
const refs = [];
const addRef = (filePath, declaredBy) => {
  if (typeof filePath === 'string' && filePath) refs.push({ filePath, declaredBy });
};

addRef(manifest.background?.service_worker, 'background.service_worker');
for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
  for (const p of cs.js ?? []) addRef(p, `content_scripts[${i}].js`);
  for (const p of cs.css ?? []) addRef(p, `content_scripts[${i}].css`);
}
for (const [i, war] of (manifest.web_accessible_resources ?? []).entries()) {
  for (const p of war.resources ?? []) addRef(p, `web_accessible_resources[${i}].resources`);
}
addRef(manifest.action?.default_popup, 'action.default_popup');
for (const [size, p] of Object.entries(manifest.action?.default_icon ?? {})) {
  addRef(p, `action.default_icon["${size}"]`);
}
for (const [size, p] of Object.entries(manifest.icons ?? {})) {
  addRef(p, `icons["${size}"]`);
}

// Locales live at a fixed path derived from the locale name, not declared directly.
const localesDir = join(dist, '_locales');
if (!existsSync(localesDir)) {
  errors.push('dist/_locales/ is missing — manifest.json declares __MSG_*__ placeholders');
} else {
  const locales = readdirSync(localesDir);
  if (manifest.default_locale && !locales.includes(manifest.default_locale)) {
    errors.push(
      `default_locale "${manifest.default_locale}" has no dist/_locales/${manifest.default_locale}/`,
    );
  }
  for (const locale of locales) {
    const messages = join(localesDir, locale, 'messages.json');
    if (!existsSync(messages)) errors.push(`dist/_locales/${locale}/messages.json is missing`);
  }
}

// Uses the manifest's own paths, so a wrongly nested build fails on real data.
for (const { filePath, declaredBy } of refs) {
  if (filePath.includes('*')) {
    // Glob-ish entry: check the literal directory prefix holds at least one file.
    const dir = join(dist, filePath.slice(0, filePath.indexOf('*')).replace(/\/$/, ''));
    if (!existsSync(dir) || readdirSync(dir).length === 0) {
      errors.push(`${declaredBy} → "${filePath}" matches nothing under dist/`);
    }
  } else if (!existsSync(join(dist, filePath))) {
    errors.push(`${declaredBy} → "${filePath}" is not in dist/`);
  }
}

// popup.html is copied verbatim, so its relative script/stylesheet links can rot
// independently of the manifest.
const popupPath = manifest.action?.default_popup;
if (popupPath && existsSync(join(dist, popupPath))) {
  const html = readFileSync(join(dist, popupPath), 'utf-8');
  for (const [, attr, ref] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
    if (/^(?:[a-z]+:|#|\/\/|\/)/i.test(ref)) continue;
    const target = join(dist, dirname(popupPath), ref);
    if (!existsSync(target)) errors.push(`${popupPath} → ${attr}="${ref}" is not in dist/`);
  }
}

report();

function report() {
  if (errors.length > 0) {
    console.error('✗ dist/ is not loadable as an extension:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`✓ dist/ layout verified (${refs.length} manifest references)`);
}
