/**
 * version.js — Syncs version from package.json to manifest.json and
 * updates the CHANGELOG comparison link before a release.
 *
 * Usage: npm version <patch|minor|major>  (runs automatically via `preversion` hook)
 *   or: node scripts/version.js             (dry-run, shows current version)
 */

import { execFileSync } from 'node:child_process';
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

// Sync manifest.json — rewrite only the version value, so the rest of the file
// keeps its formatting instead of being reflowed by JSON.stringify.
const manifestSrc = readFileSync(manifestPath, 'utf-8');
const manifestOut = manifestSrc.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
if (manifestOut === manifestSrc) {
  throw new Error(`could not find a "version" field in ${manifestPath}`);
}
writeFileSync(manifestPath, manifestOut);
console.log(`✓ manifest.json → ${version}`);

// Update CHANGELOG comparison links
let changelog = readFileSync(changelogPath, 'utf-8');
// Replace placeholder <user> with the first remote found, or keep as-is
changelog = changelog.replace(
  /\[Unreleased\]:.*$/m,
  `[Unreleased]: https://github.com/sponsorblockAi/sponsorblock-ai-extension/compare/v${version}...HEAD`,
);
writeFileSync(changelogPath, changelog);
console.log(`✓ CHANGELOG.md comparison links updated`);

// npm only stages package.json and the lockfile before running `git commit -m`,
// so anything this script touches has to be staged here or it never reaches the
// release commit — leaving the tagged manifest.json on the previous version.
// Only stage when running as the `version` lifecycle script, so a direct
// `node scripts/version.js` never touches the git index.
if (process.env.npm_lifecycle_event === 'version') {
  execFileSync('git', ['add', 'src/manifest.json', 'CHANGELOG.md'], { cwd: root });
  console.log(`✓ staged src/manifest.json, CHANGELOG.md`);
}

console.log(`\nVersion: ${version}`);
