#!/usr/bin/env node
// node-security release-age: checks the lockfile against the minimum release age and the release-age exceptions.
// It lists the entries that are too young, the date when each one becomes installable, and the state of each exception.
// Read-only. Network: npm registry only (package metadata, to read publication times).
//
// Usage: node release-age.mjs [repo-path] [--min-age <minutes>] [--json]
// Test options: --times-file <file.json> ({ "name@version": "ISO time" }, no network), --now <ISO time>
// Exit code 0 = PASS, 1 = FAIL, 2 = usage or data error.

import fs from 'node:fs';
import path from 'node:path';
import {
  PROTOCOL_VERSION, POLICY_RELEASE_AGE_MINUTES, MIN_EXCEPTION_AGE_MINUTES, exists, readTextSafe, readJsonSafe,
  parseSimpleYaml, parseNpmrc, npmrcList, parseExactExclusion, lockfileEntries, parseArgs, isExactSemver, printTable,
} from './lib/common.mjs';

const REGISTRY = 'https://registry.npmjs.org/';
const CONCURRENCY = 8;
const MINUTE = 60_000;

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args._[0] ?? process.cwd());
if (!exists(root)) {
  console.error(`Path not found: ${root}`);
  process.exit(2);
}

const { lockfile, entries } = lockfileEntries(root);
if (!lockfile) {
  console.error('No pnpm-lock.yaml or package-lock.json found.');
  process.exit(2);
}

// Configuration of the repository.
const ws = parseSimpleYaml(readTextSafe(path.join(root, 'pnpm-workspace.yaml')));
const npmrcText = readTextSafe(path.join(root, '.npmrc'));
const npmrc = parseNpmrc(npmrcText);
const isPnpm = lockfile === 'pnpm-lock.yaml';

// Minimum age: argument, then the repository configuration, then the protocol policy (3 days).
let minAge = POLICY_RELEASE_AGE_MINUTES;
let minAgeSource = 'protocol policy';
if (args['min-age'] !== undefined) {
  minAge = Number(args['min-age']);
  minAgeSource = 'argument';
} else if (isPnpm && typeof ws.minimumReleaseAge === 'number') {
  minAge = ws.minimumReleaseAge;
  minAgeSource = 'pnpm-workspace.yaml';
} else if (!isPnpm && Number(npmrc['min-release-age']) > 0) {
  minAge = Number(npmrc['min-release-age']) * 1440;
  minAgeSource = '.npmrc';
}
if (!Number.isFinite(minAge) || minAge < 0) {
  console.error(`Invalid minimum age: ${args['min-age']}`);
  process.exit(2);
}
const now = args.now ? Date.parse(args.now) : Date.now();

// Release-age exceptions. pnpm: exact versions. npm: package names (npm does not accept versions).
const exceptionEntries = isPnpm
  ? (Array.isArray(ws.minimumReleaseAgeExclude) ? ws.minimumReleaseAgeExclude.map(String) : [])
  : npmrcList(npmrcText, 'min-release-age-exclude');
const exceptions = [];
const findings = [];
for (const raw of exceptionEntries) {
  if (isPnpm) {
    const exact = parseExactExclusion(raw);
    if (exact) exceptions.push({ raw, name: exact.name, versions: exact.versions, used: false });
    else findings.push({ level: 'FAIL', id: 'EXCEPTION_PATTERN', detail: raw, fix: 'Use exact versions: <name>@<version>. A name or a pattern also covers future versions.' });
  } else if (/[*?[\]{}]/.test(raw)) {
    findings.push({ level: 'FAIL', id: 'EXCEPTION_PATTERN', detail: raw, fix: 'Use a package name. A pattern covers many packages.' });
  } else {
    exceptions.push({ raw, name: raw, versions: null, used: false });
  }
}
const exceptionFor = (e) => exceptions.find((x) => x.name === e.name && (x.versions === null || x.versions.includes(e.version)));

// Direct dependencies with an exact version: a new resolution cannot select another version for them.
const pkg = readJsonSafe(path.join(root, 'package.json')).value ?? {};
const exactPins = new Map();
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
    if (isExactSemver(spec)) exactPins.set(name, spec);
  }
}

async function publicationTimes() {
  if (typeof args['times-file'] === 'string') {
    return JSON.parse(fs.readFileSync(args['times-file'], 'utf8'));
  }
  const times = {};
  const names = [...new Set(entries.map((e) => e.name))];
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++];
      try {
        const res = await fetch(REGISTRY + name.replace('/', '%2F'), { headers: { accept: 'application/json' } });
        if (!res.ok) continue;
        const doc = await res.json();
        for (const e of entries.filter((x) => x.name === name)) {
          if (doc.time?.[e.version]) times[`${name}@${e.version}`] = doc.time[e.version];
        }
      } catch {
        // Unknown time: reported below.
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return times;
}

const times = await publicationTimes();
const blocked = [];
const excepted = [];
const unknown = [];
for (const e of entries) {
  const id = `${e.name}@${e.version}`;
  const t = times[id];
  if (!t) { unknown.push(id); continue; }
  const published = Date.parse(t);
  const ageMinutes = Math.floor((now - published) / MINUTE);
  const eligibleAt = new Date(published + minAge * MINUTE).toISOString();
  const row = { package: id, published: new Date(published).toISOString(), eligibleAt, exactPin: exactPins.get(e.name) === e.version };
  const exception = exceptionFor(e);
  if (exception) {
    exception.used = true;
    if (ageMinutes < MIN_EXCEPTION_AGE_MINUTES) {
      excepted.push({ ...row, state: 'too-young' });
      findings.push({ level: 'FAIL', id: 'EXCEPTION_TOO_YOUNG', detail: `${id} (published ${row.published})`, fix: 'Remove the exception. An exception never covers a version younger than 24 hours.' });
    } else if (ageMinutes >= minAge) {
      excepted.push({ ...row, state: 'stale' });
      findings.push({ level: 'WARN', id: 'STALE_EXCLUDE', detail: `${exception.raw} (${id} is installable without it)`, fix: 'Remove the exception.' });
    } else {
      excepted.push({ ...row, state: 'active' });
    }
  } else if (ageMinutes < minAge) {
    blocked.push({ ...row, exceptionPossible: ageMinutes >= MIN_EXCEPTION_AGE_MINUTES });
  }
}
for (const x of exceptions.filter((x) => !x.used)) {
  findings.push({ level: 'WARN', id: 'STALE_EXCLUDE', detail: `${x.raw} (not in the lockfile)`, fix: 'Remove the exception.' });
}
const active = excepted.filter((x) => x.state === 'active');
if (active.length) {
  findings.push({ level: 'WARN', id: 'EXCEPTION', detail: `${active.length} active exceptions, last one expires ${active.map((x) => x.eligibleAt).sort().pop()}`, fix: 'Record the reason in the report and in the commit message. Remove each exception when it expires.' });
}
if (blocked.length) {
  findings.unshift({ level: 'FAIL', id: 'BLOCKED', detail: `${blocked.length} entries younger than ${minAge} minutes`, fix: 'See "Release-age block" in reference/migrate.md.' });
}
blocked.sort((a, b) => a.eligibleAt.localeCompare(b.eligibleAt));

const latest = (list) => (list.length ? list.map((b) => b.eligibleAt).sort().pop() : null);
const failed = findings.some((f) => f.level === 'FAIL');
const report = {
  protocolVersion: PROTOCOL_VERSION,
  path: root,
  lockfile,
  minimumReleaseAgeMinutes: minAge,
  minimumReleaseAgeSource: minAgeSource,
  now: new Date(now).toISOString(),
  result: failed ? 'FAIL' : 'PASS',
  entries: entries.length,
  blockedCount: blocked.length,
  allEligibleAt: latest(blocked),
  exactPinsEligibleAt: latest(blocked.filter((b) => b.exactPin)),
  // Entries that an exception can cover: published 24 hours ago or more.
  exceptionCandidates: blocked.filter((b) => b.exceptionPossible).map((b) => b.package),
  // Entries that no exception can cover yet, with the time when an exception becomes possible.
  notExceptable: blocked.filter((b) => !b.exceptionPossible)
    .map((b) => ({ package: b.package, exceptionPossibleAt: new Date(Date.parse(b.published) + MIN_EXCEPTION_AGE_MINUTES * MINUTE).toISOString() })),
  findings,
  blocked,
  excepted,
  unknown,
};

const local = (iso) => (iso ? new Date(iso).toLocaleString() : '-');
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`node-security release-age (protocol ${PROTOCOL_VERSION})`);
  console.log(`Repository: ${root}`);
  console.log(`Lockfile: ${lockfile}, ${entries.length} entries. Minimum release age: ${minAge} minutes (${minAgeSource}).\n`);
  if (blocked.length) {
    printTable(blocked.map((b) => ({ ...b, exactPin: b.exactPin ? 'yes' : '', exceptionPossible: b.exceptionPossible ? 'yes' : 'no' })),
      ['package', 'published', 'eligibleAt', 'exactPin', 'exceptionPossible']);
    console.log(`\nAll entries installable after: ${report.allEligibleAt} (${local(report.allEligibleAt)}).`);
    console.log(`Exact pins in package.json installable after: ${report.exactPinsEligibleAt ? `${report.exactPinsEligibleAt} (${local(report.exactPinsEligibleAt)})` : 'no exact pin is blocked'}.\n`);
  } else {
    console.log('No entry is blocked by the minimum release age.\n');
  }
  if (findings.length) printTable(findings, ['level', 'id', 'detail', 'fix']);
  if (unknown.length) console.log(`\nUnknown publication time (not checked): ${unknown.length} entries.`);
  console.log(`\nResult: ${report.result}`);
}
process.exit(failed ? 1 : 0);
