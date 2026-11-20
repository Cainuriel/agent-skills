// Tests for the evaluation tooling: every fixture is created, and the graders give the
// expected result before any agent action. Run: node --test tests/evals.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setupCase } from '../evals/setup.mjs';
import { loadCases } from '../evals/lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hasGit = spawnSync('git', ['--version']).status === 0;

// Cases whose checks are post-conditions of a correct agent run: they fail before the run.
const FAIL_AT_BASELINE = new Set(['new-01', 'mig-02', 'mig-04', 'mig-05', 'mig-06', 'npm-01']);

const { cases } = loadCases();

test('cases.json: ids are unique and every case has a query and expected behavior', () => {
  const ids = cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of cases) {
    assert.ok(c.query && c.expected_behavior.length && c.fs_checks.length, c.id);
  }
});

for (const c of cases) {
  test(`eval ${c.id}: baseline grading is ${FAIL_AT_BASELINE.has(c.id) ? 'FAIL' : 'PASS'}`, { skip: !hasGit && 'git not available' }, () => {
    const dir = setupCase(c);
    const r = spawnSync(process.execPath, [path.join(root, 'evals', 'check.mjs'), c.id, dir], { encoding: 'utf8' });
    assert.equal(r.status, FAIL_AT_BASELINE.has(c.id) ? 1 : 0, r.stdout + r.stderr);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(`${dir}.baseline.json`, { force: true });
  });
}
