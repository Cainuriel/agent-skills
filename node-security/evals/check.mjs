#!/usr/bin/env node
// Grades an evaluation case after the agent run.
// Part 1 (automatic): file system checks from cases.json.
// Part 2 (manual): the expected behavior, as a checklist for the transcript.
// Usage: node evals/check.mjs <case-id> <fixture-dir>
// Exit code 0 = all file system checks pass, 1 = a check fails, 2 = usage error.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadCases, skillDir, snapshot, baselineFile } from './lib.mjs';

const [id, dirArg] = process.argv.slice(2);
if (!id || !dirArg) {
  console.error('Usage: node evals/check.mjs <case-id> <fixture-dir>');
  process.exit(2);
}
const dir = path.resolve(dirArg);
const c = loadCases().cases.find((x) => x.id === id);
if (!c) {
  console.error(`Unknown case: ${id}`);
  process.exit(2);
}
const baseline = JSON.parse(fs.readFileSync(baselineFile(dir), 'utf8'));
const now = snapshot(dir);

const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const readText = (rel) => {
  try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return null; }
};

const results = [];
const record = (ok, check, detail = '') => results.push({ ok, check, detail });

for (const chk of c.fs_checks) {
  if (chk.unchanged) {
    for (const target of chk.unchanged) {
      if (target === '*') {
        const added = Object.keys(now.files).filter((f) => !(f in baseline.files));
        const removed = Object.keys(baseline.files).filter((f) => !(f in now.files));
        const changed = Object.keys(now.files).filter((f) => f in baseline.files && now.files[f] !== baseline.files[f]);
        const nm = now.nodeModules !== baseline.nodeModules ? ['node_modules'] : [];
        const diff = [...added.map((f) => `+${f}`), ...removed.map((f) => `-${f}`), ...changed.map((f) => `~${f}`), ...nm];
        record(diff.length === 0, 'unchanged: all files', diff.join(', '));
      } else {
        record(now.files[target] === baseline.files[target], `unchanged: ${target}`);
      }
    }
  }
  if (chk.exists) for (const f of chk.exists) record(fs.existsSync(path.join(dir, f)), `exists: ${f}`);
  if (chk.absent) for (const f of chk.absent) record(!fs.existsSync(path.join(dir, f)), `absent: ${f}`);
  if (chk.contains) {
    const t = readText(chk.contains.file);
    record(t !== null && t.includes(chk.contains.text), `contains: ${chk.contains.file} "${chk.contains.text}"`);
  }
  if (chk.notContains) {
    const t = readText(chk.notContains.file);
    record(t === null || !t.includes(chk.notContains.text), `not contains: ${chk.notContains.file} "${chk.notContains.text}"`);
  }
  if (chk.json) {
    let value;
    try { value = getPath(JSON.parse(readText(chk.json.file)), chk.json.path); } catch { value = undefined; }
    record(new RegExp(chk.json.match).test(String(value ?? '')), `json: ${chk.json.file} ${chk.json.path} ~ /${chk.json.match}/`, `value: ${value}`);
  }
  if (chk.policy) {
    const r = spawnSync(process.execPath, [path.join(skillDir, 'scripts', 'check-policy.mjs'), dir, '--json'], { encoding: 'utf8' });
    let result;
    try { result = JSON.parse(r.stdout).result; } catch { result = 'ERROR'; }
    record(result === chk.policy, `policy: ${chk.policy}`, `actual: ${result}`);
  }
}

console.log(`Case ${c.id} (${c.scenario})\n`);
console.log('Part 1. File system checks (automatic)');
for (const r of results) console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.check}${r.detail ? `  (${r.detail})` : ''}`);
console.log('\nPart 2. Expected behavior (check in the transcript)');
for (const b of c.expected_behavior) console.log(`  [ ] ${b}`);
const failed = results.some((r) => !r.ok);
console.log(`\nFile system result: ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
