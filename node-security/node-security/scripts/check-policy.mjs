#!/usr/bin/env node
// node-security check-policy: compliance check for an own repository. Read-only.
// Usage: node check-policy.mjs [repo-path] [--mode pnpm|npm] [--json]
// Mode: pnpm by default. npm when devEngines.packageManager.name is "npm".
// Exit code 0 = PASS, 1 = FAIL, 2 = usage error.

import path from 'node:path';
import {
  PROTOCOL_VERSION, MIN_RELEASE_AGE_MINUTES, MIN_PNPM_MAJOR, MIN_NPM_MAJOR, FOREIGN_LOCKFILES,
  NPM_REGISTRY_HOSTS, exists, readTextSafe, readJsonSafe, parseNpmrc, npmrcList, parseSimpleYaml, walk,
  parseArgs, semverMajor, isExactSemver, parseExactExclusion, printTable, NPMRC_TRANSLATIONS, isRegistryOrAuthKey,
  findNpmReferences,
} from './lib/common.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args._[0] ?? process.cwd());
if (!exists(root)) {
  console.error(`Path not found: ${root}`);
  process.exit(2);
}

const results = [];
const fail = (id, detail, fix) => results.push({ level: 'FAIL', id, detail, fix });
const warn = (id, detail, fix) => results.push({ level: 'WARN', id, detail, fix });
const info = (id, detail) => results.push({ level: 'INFO', id, detail, fix: '' });

const pkg = readJsonSafe(path.join(root, 'package.json'));
if (pkg.missing) fail('PACKAGE_JSON', 'package.json not found', 'Run the scenario "new".');
if (pkg.error) fail('PACKAGE_JSON', `Invalid JSON: ${pkg.error}`, 'Correct package.json.');
const p = pkg.value ?? {};
const devPm = p.devEngines?.packageManager;
const mode = args.mode ?? (devPm?.name === 'npm' ? 'npm' : 'pnpm');
if (!['pnpm', 'npm'].includes(mode)) {
  console.error(`Unknown mode: ${mode}`);
  process.exit(2);
}

const lockfilesAnywhere = [];
walk(root, {
  maxDepth: 6,
  onFile: (full, rel) => {
    const base = path.basename(full);
    if (base === 'pnpm-lock.yaml' || FOREIGN_LOCKFILES.includes(base)) lockfilesAnywhere.push(rel);
  },
});

if (mode === 'pnpm') {
  // packageManager: exact pnpm version, major >= MIN_PNPM_MAJOR.
  const pm = typeof p.packageManager === 'string' ? p.packageManager : null;
  const [pmName, pmVersionRaw] = pm ? pm.split('@') : [null, null];
  const pmVersion = pmVersionRaw?.split('+')[0];
  if (!pm) fail('PACKAGE_MANAGER', 'packageManager is missing', 'Set "packageManager": "pnpm@<exact-version>".');
  else if (pmName !== 'pnpm') fail('PACKAGE_MANAGER', `packageManager is ${pm}`, 'Set "packageManager": "pnpm@<exact-version>".');
  else if (!isExactSemver(pmVersion)) fail('PACKAGE_MANAGER', `Version is not exact: ${pm}`, 'Use an exact version, for example pnpm@12.21.0.');
  else if (semverMajor(pmVersion) < MIN_PNPM_MAJOR) fail('PACKAGE_MANAGER', `${pm} is earlier than pnpm ${MIN_PNPM_MAJOR}`, 'Update to the current pnpm version.');

  // devEngines: stops npm in this repository.
  if (devPm?.name !== 'pnpm' || devPm?.onFail !== 'error') {
    fail('DEV_ENGINES', 'devEngines.packageManager does not require pnpm with onFail "error"',
      'Add "devEngines": { "packageManager": { "name": "pnpm", "onFail": "error" } }.');
  }

  // Lockfiles.
  if (!lockfilesAnywhere.includes('pnpm-lock.yaml')) fail('PNPM_LOCKFILE', 'pnpm-lock.yaml not found at the root', 'Run pnpm install and commit pnpm-lock.yaml.');
  for (const f of lockfilesAnywhere.filter((r) => !r.endsWith('pnpm-lock.yaml'))) {
    fail('FOREIGN_LOCKFILE', f, 'Delete this lockfile. The repository uses pnpm.');
  }

  // pnpm-workspace.yaml.
  const wsText = readTextSafe(path.join(root, 'pnpm-workspace.yaml'));
  if (wsText === null) {
    fail('WORKSPACE_FILE', 'pnpm-workspace.yaml not found', 'Copy assets/pnpm-workspace.yaml to the root.');
  } else {
    const ws = parseSimpleYaml(wsText);
    const age = ws.minimumReleaseAge;
    if (age === undefined) warn('RELEASE_AGE', 'minimumReleaseAge is not set (pnpm default 1440)', 'Set minimumReleaseAge explicitly for audits.');
    else if (typeof age !== 'number' || age < MIN_RELEASE_AGE_MINUTES) fail('RELEASE_AGE', `minimumReleaseAge: ${age}`, `Set minimumReleaseAge to ${MIN_RELEASE_AGE_MINUTES} or more.`);
    if (ws.trustPolicy !== 'no-downgrade') fail('TRUST_POLICY', `trustPolicy: ${ws.trustPolicy ?? '(not set)'}`, 'Set trustPolicy: no-downgrade.');
    if (ws.blockExoticSubdeps === false) fail('EXOTIC_SUBDEPS', 'blockExoticSubdeps: false', 'Set blockExoticSubdeps: true.');
    else if (ws.blockExoticSubdeps === undefined) warn('EXOTIC_SUBDEPS', 'blockExoticSubdeps is not set (pnpm default true)', 'Set it explicitly for audits.');
    if (ws.strictDepBuilds === false) fail('STRICT_BUILDS', 'strictDepBuilds: false', 'Set strictDepBuilds: true.');
    else if (ws.strictDepBuilds === undefined) warn('STRICT_BUILDS', 'strictDepBuilds is not set (pnpm default true)', 'Set it explicitly for audits.');
    if (ws.dangerouslyAllowAllBuilds === true) fail('ALL_BUILDS', 'dangerouslyAllowAllBuilds: true', 'Remove it. Approve builds one by one.');
    if (ws.trustLockfile === true) fail('TRUST_LOCKFILE', 'trustLockfile: true', 'Remove it. pnpm must check the lockfile against the policy.');
    // Release-age exceptions: exact versions only. A name or a pattern also covers future versions.
    const excl = Array.isArray(ws.minimumReleaseAgeExclude) ? ws.minimumReleaseAgeExclude.map(String) : [];
    const patterns = excl.filter((e) => !parseExactExclusion(e));
    const exact = excl.filter((e) => parseExactExclusion(e));
    if (patterns.length) fail('EXCEPTION_PATTERN', patterns.join(', '), 'Use exact versions: <name>@<version>. See "Release-age exceptions" in SKILL.md.');
    if (exact.length) warn('EXCEPTION', exact.join(', '), 'Temporary exceptions. Run release-age.mjs to find expired exceptions (STALE_EXCLUDE) and remove them.');
    if (ws.allowBuilds && typeof ws.allowBuilds === 'object') {
      const allowed = Object.entries(ws.allowBuilds).filter(([, v]) => v === true).map(([k]) => k);
      if (allowed.length) info('ALLOWED_BUILDS', allowed.join(', '));
    }
  }

  // .npmrc in a pnpm repository: authentication and registry only. pnpm 11+ ignores other npm keys.
  const npmrc = parseNpmrc(readTextSafe(path.join(root, '.npmrc')));
  for (const [key, value] of Object.entries(npmrc)) {
    if (key === 'registry' || /^@[^:]+:registry$/.test(key)) {
      const host = value.replace(/^https?:\/\//, '').split('/')[0];
      if (!NPM_REGISTRY_HOSTS.includes(host)) warn('CUSTOM_REGISTRY', `.npmrc ${key}=${value}`, 'Confirm that this registry is intended.');
    } else if (isRegistryOrAuthKey(key)) {
      continue;
    } else if (Object.hasOwn(NPMRC_TRANSLATIONS, key)) {
      const target = NPMRC_TRANSLATIONS[key];
      fail('NPMRC_TRANSLATION', `.npmrc ${key}=${value}. pnpm ignores this key.`,
        target ? `Set ${target}: ${value} in pnpm-workspace.yaml and remove the key (reference/migrate.md).` : 'Remove the key (reference/migrate.md, "Translate .npmrc").');
    } else {
      warn('NPMRC_SETTING', `.npmrc ${key}`, 'pnpm 11+ reads settings from pnpm-workspace.yaml. Ask the user how to translate this key.');
    }
  }

  // npm commands that remain in the repository after a migration.
  const refs = findNpmReferences(root);
  if (refs.length) {
    const files = [...new Set(refs.map((r) => r.file))];
    warn('NPM_REFERENCES', `${refs.length} npm commands in ${files.length} files: ${files.slice(0, 6).join(', ')}${files.length > 6 ? ', ...' : ''}`,
      'Change them to pnpm (reference/migrate.md, step 11). Agent files: tell the user, do not edit.');
  }
} else {
  // npm mode: documented exception.
  if (devPm?.name !== 'npm' || devPm?.onFail !== 'error' || !/>=\s*12/.test(String(devPm?.version ?? ''))) {
    fail('DEV_ENGINES', 'devEngines.packageManager does not require npm >=12.0.0 with onFail "error"',
      'Add "devEngines": { "packageManager": { "name": "npm", "version": ">=12.0.0", "onFail": "error" } }.');
  }
  if (!lockfilesAnywhere.includes('package-lock.json')) fail('NPM_LOCKFILE', 'package-lock.json not found at the root', 'Run npm install and commit package-lock.json.');
  const npmrcText = readTextSafe(path.join(root, '.npmrc'));
  if (npmrcText === null) {
    fail('NPMRC', '.npmrc not found', 'Copy assets/npmrc.hardened to .npmrc.');
  } else {
    const npmrc = parseNpmrc(npmrcText);
    const days = Number(npmrc['min-release-age']);
    if (!(days >= 1)) fail('RELEASE_AGE', `min-release-age=${npmrc['min-release-age'] ?? '(not set)'}`, 'Set min-release-age to 1 or more (days).');
    if (npmrc['allow-git'] !== 'none') fail('ALLOW_GIT', `allow-git=${npmrc['allow-git'] ?? '(not set)'}`, 'Set allow-git=none.');
    if (npmrc['allow-remote'] !== 'none') fail('ALLOW_REMOTE', `allow-remote=${npmrc['allow-remote'] ?? '(not set)'}`, 'Set allow-remote=none.');
    const npmExcl = npmrcList(npmrcText, 'min-release-age-exclude');
    const globs = npmExcl.filter((e) => /[*?[\]{}]/.test(e));
    if (globs.length) fail('EXCEPTION_PATTERN', globs.join(', '), 'Use package names only. A pattern covers many packages.');
    const names = npmExcl.filter((e) => !/[*?[\]{}]/.test(e));
    if (names.length) warn('EXCEPTION', names.join(', '), 'npm exceptions cover all versions of the package. Run release-age.mjs to find expired exceptions (STALE_EXCLUDE) and remove them.');
    if (npmrc['ignore-scripts'] === 'true') fail('IGNORE_SCRIPTS', 'ignore-scripts=true', 'Remove it. In npm 12 it overrides the approval list and stops project scripts.');
  }
  const approvals = p.allowScripts ?? p.npm?.allowScripts;
  if (approvals && typeof approvals === 'object') {
    const nameOnly = Object.keys(approvals).filter((k) => !/@\d/.test(k.replace(/^@/, '')));
    if (nameOnly.length) warn('NAME_ONLY_APPROVAL', nameOnly.join(', '), 'Approve exact versions. A name-only approval covers future versions.');
  }
}

if (exists(path.join(root, '.github', 'workflows')) && !exists(path.join(root, '.github', 'workflows', 'node-security.yml'))) {
  warn('CI_WORKFLOW', '.github/workflows/node-security.yml not found', 'Copy assets/node-security.workflow.yml.');
}

const failed = results.some((r) => r.level === 'FAIL');
const report = { protocolVersion: PROTOCOL_VERSION, path: root, mode, result: failed ? 'FAIL' : 'PASS', results };
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`node-security check-policy (protocol ${PROTOCOL_VERSION}, mode ${mode})`);
  console.log(`Repository: ${root}\n`);
  if (results.length) printTable(results, ['level', 'id', 'detail', 'fix']);
  console.log(`\nResult: ${report.result}`);
}
process.exit(failed ? 1 : 0);
