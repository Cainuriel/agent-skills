#!/usr/bin/env node
// node-security lock-diff: compares the package versions of an old lockfile with the current lockfile. Read-only.
// Use it after option B of "Release-age block" (reference/migrate.md) to show the user what changed.
//
// Usage: node lock-diff.mjs <old-lockfile> [repo-path] [--json]
//   <old-lockfile>: a package-lock.json or pnpm-lock.yaml file, for example from
//   "git show HEAD:package-lock.json > <temp-dir>/old-package-lock.json".
// Exit code 0, or 2 on a usage or data error.

import path from 'node:path';
import {
  PROTOCOL_VERSION, exists, readTextSafe, readJsonSafe, parseLockfileText, lockfileEntries, parseArgs, printTable,
} from './lib/common.mjs';

const args = parseArgs(process.argv.slice(2));
const oldFile = args._[0];
const root = path.resolve(args._[1] ?? process.cwd());
if (!oldFile || !exists(root)) {
  console.error('Usage: node lock-diff.mjs <old-lockfile> [repo-path] [--json]');
  process.exit(2);
}
const oldText = readTextSafe(path.resolve(oldFile));
if (oldText === null) {
  console.error(`Old lockfile not found: ${oldFile}`);
  process.exit(2);
}

let oldEntries;
try {
  oldEntries = parseLockfileText(oldText, oldText.trimStart().startsWith('{') ? 'npm' : 'pnpm');
} catch (err) {
  console.error(`Old lockfile is not valid: ${err.message}`);
  process.exit(2);
}
const current = lockfileEntries(root);
if (!current.lockfile) {
  console.error('No pnpm-lock.yaml or package-lock.json found in the repository.');
  process.exit(2);
}

const versionsByName = (entries) => {
  const map = new Map();
  for (const e of entries) map.set(e.name, [...(map.get(e.name) ?? []), e.version].sort());
  return map;
};
const before = versionsByName(oldEntries);
const after = versionsByName(current.entries);

const pkg = readJsonSafe(path.join(root, 'package.json')).value ?? {};
const direct = [...new Set(['dependencies', 'devDependencies', 'optionalDependencies']
  .flatMap((f) => Object.keys(pkg[f] ?? {})))].sort();

const directRows = [];
for (const name of direct) {
  const b = (before.get(name) ?? []).join(', ') || '-';
  const a = (after.get(name) ?? []).join(', ') || '-';
  if (a !== b) directRows.push({ package: name, before: b, after: a });
}

const ids = (entries) => new Set(entries.map((e) => `${e.name}@${e.version}`));
const oldIds = ids(oldEntries);
const newIds = ids(current.entries);
const directSet = new Set(direct);
const transitiveAdded = [...newIds].filter((x) => !oldIds.has(x) && !directSet.has(x.slice(0, x.lastIndexOf('@'))));
const transitiveRemoved = [...oldIds].filter((x) => !newIds.has(x) && !directSet.has(x.slice(0, x.lastIndexOf('@'))));

const report = {
  protocolVersion: PROTOCOL_VERSION,
  path: root,
  oldLockfile: path.resolve(oldFile),
  currentLockfile: current.lockfile,
  directDependencies: direct.length,
  directUnchanged: direct.length - directRows.length,
  directChanged: directRows,
  transitiveAdded: transitiveAdded.sort(),
  transitiveRemoved: transitiveRemoved.sort(),
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`node-security lock-diff (protocol ${PROTOCOL_VERSION})`);
  console.log(`Old: ${report.oldLockfile}\nCurrent: ${root}/${current.lockfile}\n`);
  console.log(`Direct dependencies: ${direct.length}, unchanged: ${report.directUnchanged}, changed: ${directRows.length}.`);
  if (directRows.length) printTable(directRows, ['package', 'before', 'after']);
  console.log(`\nTransitive entries added: ${transitiveAdded.length}, removed: ${transitiveRemoved.length}.`);
  const shown = transitiveAdded.slice(0, 20);
  if (shown.length) console.log(`Added (first ${shown.length}): ${shown.join(', ')}`);
}
process.exit(0);
