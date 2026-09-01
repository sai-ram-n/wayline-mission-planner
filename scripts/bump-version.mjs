#!/usr/bin/env node
/**
 * Bumps version.js at the repo root and stamps today's date.
 *
 *   node scripts/bump-version.mjs            -> patch bump
 *   node scripts/bump-version.mjs minor      -> minor bump
 *   node scripts/bump-version.mjs major      -> major bump
 *   node scripts/bump-version.mjs 1.2.3      -> set explicitly
 *
 * Run before each phase commit so version.js always reflects the committed state.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'version.js');

const src = readFileSync(file, 'utf8');
const current = src.match(/VERSION = '([^']+)'/)?.[1];
if (!current) {
  console.error('Could not read VERSION from version.js');
  process.exit(1);
}

const arg = process.argv[2] ?? 'patch';
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [major, minor, patch] = current.split('.').map(Number);
  if (arg === 'major') next = `${major + 1}.0.0`;
  else if (arg === 'minor') next = `${major}.${minor + 1}.0`;
  else if (arg === 'patch') next = `${major}.${minor}.${patch + 1}`;
  else {
    console.error(`Unknown bump type: ${arg} (expected major|minor|patch|x.y.z)`);
    process.exit(1);
  }
}

const date = new Date().toISOString().slice(0, 10);
const updated = src
  .replace(/VERSION = '[^']+'/, `VERSION = '${next}'`)
  .replace(/BUILD_DATE = '[^']+'/, `BUILD_DATE = '${date}'`);

writeFileSync(file, updated);
console.log(`version.js: ${current} -> ${next}  (${date})`);
