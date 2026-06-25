/**
 * version.js — Syncs version from package.json to manifest.json and
 * updates the CHANGELOG comparison link before a release.
 *
 * Usage: npm version <patch|minor|major>  (runs automatically via `preversion` hook)
 *   or: node scripts/version.js             (dry-run, shows current version)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const pkgPath = resolve(root, 'package.json');
const manifestPath = resolve(root, 'src', 'manifest.json');
const changelogPath = resolve(root, 'CHANGELOG.md');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

// Sync manifest.json
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ manifest.json → ${version}`);

// Update CHANGELOG comparison links
let changelog = readFileSync(changelogPath, 'utf-8');
// Replace placeholder <user> with the first remote found, or keep as-is
changelog = changelog.replace(
  /\[Unreleased\]:.*$/m,
  `[Unreleased]: https://github.com/<user>/sponsorblock-ai-extension/compare/v${version}...HEAD`,
);
writeFileSync(changelogPath, changelog);
console.log(`✓ CHANGELOG.md comparison links updated`);

console.log(`\nVersion: ${version}`);
