#!/usr/bin/env node
// Release tooling for the maintainer. Node.js built-in modules only.
//
// Usage (from the repository root):
//   node tools/release/release.mjs check <skill>      Version consistency and working tree checks
//   node tools/release/release.mjs manifest <skill>   Write <skill>/SHA256SUMS for the installable folder
//   node tools/release/release.mjs message <skill>    Verify SHA256SUMS and print the message to sign
//
// The message format is: <skill>|<version>|commit:<git-commit>|sha256:<sha256-of-SHA256SUMS>
// Signature algorithm: EIP-191 (personal_sign). This script does not sign and does not verify signatures.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function git(args) {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '').trim() };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function listFiles(dir) {
  const out = [];
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) fail(`Symbolic link in the skill folder: ${full}`);
      if (e.isDirectory()) visit(full);
      else if (e.isFile()) out.push(full);
    }
  };
  visit(dir);
  return out;
}

function skillPaths(skill) {
  if (!/^[a-z0-9-]+$/.test(skill ?? '')) fail(`Invalid skill name: ${skill}`);
  const projectDir = path.join(repoRoot, skill);
  const skillDir = path.join(projectDir, skill);
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) fail(`Not found: ${skill}/${skill}/SKILL.md`);
  return { projectDir, skillDir, manifestFile: path.join(projectDir, 'SHA256SUMS') };
}

// Manifest lines: "<sha256>  <skill>/<relative-path>", sorted, LF. Paths are relative to <skill>/,
// so that `sha256sum -c SHA256SUMS` works from that folder (the installers do this).
function buildManifest(skill, skillDir) {
  const lines = listFiles(skillDir)
    .map((full) => {
      const rel = `${skill}/${path.relative(skillDir, full).split(path.sep).join('/')}`;
      const data = fs.readFileSync(full);
      if (data.includes(0x0d)) fail(`CRLF line ending in ${rel}. Check .gitattributes and your checkout.`);
      return `${sha256(data)}  ${rel}`;
    })
    .sort((a, b) => (a.slice(66) < b.slice(66) ? -1 : 1));
  return `${lines.join('\n')}\n`;
}

function readVersion(skillDir) {
  const text = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const m = text.match(/^\s+version:\s*"?([0-9]+\.[0-9]+\.[0-9]+[^"\s]*)"?\s*$/m);
  if (!m) fail('metadata.version not found in SKILL.md');
  return m[1];
}

// Every place that states the protocol version must agree with metadata.version.
function checkVersions(skill, projectDir, skillDir) {
  const version = readVersion(skillDir);
  const problems = [];
  const expect = (file, regex, label) => {
    const full = path.join(projectDir, file);
    if (!fs.existsSync(full)) return;
    const text = fs.readFileSync(full, 'utf8');
    const found = [...text.matchAll(regex)].map((m) => m[1]);
    if (found.length === 0) problems.push(`${file}: ${label} not found`);
    for (const v of found) if (v !== version) problems.push(`${file}: ${label} is ${v}, expected ${version}`);
  };
  expect(`${skill}/SKILL.md`, /Protocol version ([0-9.]+[^.\s]*)\./g, 'body version');
  expect(`${skill}/scripts/lib/common.mjs`, /PROTOCOL_VERSION = '([^']+)'/g, 'PROTOCOL_VERSION');
  for (const asset of fs.readdirSync(path.join(skillDir, 'assets'))) {
    expect(`${skill}/assets/${asset}`, /protocol ([0-9]+\.[0-9]+\.[0-9]+)/g, 'protocol version');
  }
  expect('README.md', /^Version ([0-9.]+[^.\s]*)\./gm, 'README version');
  return { version, problems };
}

const [command, skill] = process.argv.slice(2);
if (!['check', 'manifest', 'message'].includes(command)) {
  console.error('Usage: node tools/release/release.mjs <check|manifest|message> <skill>');
  process.exit(2);
}
const { projectDir, skillDir, manifestFile } = skillPaths(skill);
const { version, problems } = checkVersions(skill, projectDir, skillDir);

if (command === 'check') {
  console.log(`Skill: ${skill}  Version: ${version}`);
  for (const p of problems) console.log(`  FAIL ${p}`);
  const dirty = git(['status', '--porcelain']).out;
  if (dirty) console.log('  WARN Working tree has uncommitted changes');
  const tags = git(['tag', '--list', `${skill}-v${version}`]).out;
  if (tags) console.log(`  FAIL Tag ${skill}-v${version} already exists`);
  const ok = problems.length === 0 && !tags;
  console.log(ok ? 'Result: PASS' : 'Result: FAIL');
  process.exit(ok ? 0 : 1);
}

if (problems.length) fail(`Version mismatch:\n  ${problems.join('\n  ')}`);

if (command === 'manifest') {
  fs.writeFileSync(manifestFile, buildManifest(skill, skillDir));
  console.log(`Written: ${path.relative(repoRoot, manifestFile)}`);
  console.log(`Next: commit it, then run: node tools/release/release.mjs message ${skill}`);
  process.exit(0);
}

// command === 'message'
if (!fs.existsSync(manifestFile)) fail(`Missing ${skill}/SHA256SUMS. Run the manifest command first.`);
const manifest = fs.readFileSync(manifestFile);
if (manifest.toString('utf8') !== buildManifest(skill, skillDir)) {
  fail('SHA256SUMS does not match the skill files. Run the manifest command again and commit.');
}
if (git(['status', '--porcelain']).out) fail('The working tree has uncommitted changes. Commit first.');
const tracked = git(['ls-files', '--error-unmatch', path.relative(repoRoot, manifestFile).split(path.sep).join('/')]);
if (tracked.code !== 0) fail('SHA256SUMS is not committed.');
const commit = git(['rev-parse', 'HEAD']).out;
if (!/^[0-9a-f]{40}$/.test(commit)) fail('Cannot read the HEAD commit.');

const message = `${skill}|${version}|commit:${commit}|sha256:${sha256(manifest)}`;
console.log('Message to sign (copy exactly, one line, no trailing space):\n');
console.log(message);
console.log(`\nTag name: ${skill}-v${version}`);
