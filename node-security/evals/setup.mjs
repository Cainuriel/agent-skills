#!/usr/bin/env node
// Creates the fixture repository of an evaluation case in the system temporary directory.
// Usage: node evals/setup.mjs <case-id> | --all
// Output: the path of each fixture, the query and the planned user replies.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixtureDefinitions } from './fixtures.mjs';
import { loadCases, skillDir, snapshot, baselineFile } from './lib.mjs';

const GIT_FLAGS = ['-c', 'user.name=node-security-eval', '-c', 'user.email=eval@example.invalid',
  '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];

function git(dir, args) {
  const r = spawnSync('git', [...GIT_FLAGS, ...args], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
}

export function setupCase(c) {
  const defs = fixtureDefinitions(skillDir);
  const def = defs[c.fixture];
  if (!def) throw new Error(`Unknown fixture: ${c.fixture}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nsec-${c.id}-`));
  writeFiles(dir, def.files);
  if (def.git) {
    git(dir, ['init', '-q']);
    git(dir, ['remote', 'add', 'origin', def.git.remote]);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'Fixture']);
    if (def.git.dirty) writeFiles(dir, def.git.dirty);
  }
  fs.writeFileSync(baselineFile(dir), JSON.stringify(snapshot(dir), null, 2));
  return dir;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node evals/setup.mjs <case-id> | --all');
    process.exit(2);
  }
  const { cases } = loadCases();
  const selected = arg === '--all' ? cases : cases.filter((c) => c.id === arg);
  if (!selected.length) {
    console.error(`Unknown case: ${arg}`);
    process.exit(2);
  }
  for (const c of selected) {
    const dir = setupCase(c);
    console.log(`\n[${c.id}] scenario: ${c.scenario}`);
    console.log(`Fixture: ${dir}`);
    console.log(`Query: ${c.query}`);
    if (c.user_replies.length) console.log(`Planned user replies: ${c.user_replies.map((r) => `"${r}"`).join(' / ')}`);
    console.log(`After the run: node evals/check.mjs ${c.id} "${dir}"`);
  }
}
