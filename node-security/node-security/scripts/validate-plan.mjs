#!/usr/bin/env node
// node-security validate-plan: validates a migration plan before any file changes. Read-only.
// Usage: node validate-plan.mjs <plan-file> [--repo repo-path] [--json]
// Exit code 0 = PASS, 1 = FAIL, 2 = usage error.

import path from 'node:path';
import {
  PROTOCOL_VERSION, MIN_PNPM_MAJOR, exists, readJsonSafe, isAgentPath, parseArgs,
  semverMajor, isExactSemver, toPosix, printTable,
} from './lib/common.mjs';

const args = parseArgs(process.argv.slice(2));
const planFile = args._[0];
if (!planFile) {
  console.error('Usage: node validate-plan.mjs <plan-file> [--repo repo-path] [--json]');
  process.exit(2);
}
const root = path.resolve(typeof args.repo === 'string' ? args.repo : process.cwd());
const plan = readJsonSafe(path.resolve(planFile));
if (plan.missing) {
  console.error(`Plan file not found: ${planFile}`);
  process.exit(2);
}

const results = [];
const fail = (id, detail) => results.push({ level: 'FAIL', id, detail });
const warn = (id, detail) => results.push({ level: 'WARN', id, detail });

const SOURCE_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock'];
const DELETABLE = new Set([...SOURCE_LOCKFILES, 'node_modules', '.npmrc']);
const RELEASE_AGE_OPTIONS = ['none', 'wait', 'resolve-again', 'exception'];
const CREATABLE = new Set(['pnpm-workspace.yaml', 'pnpm-lock.yaml', '.github/workflows/node-security.yml']);
const EDITABLE_NAMES = new Set(['package.json', 'README.md', 'angular.json', 'Dockerfile', '.gitignore']);

// A plan path must be relative, without "..", and inside the repository.
function checkPath(list, rel) {
  if (typeof rel !== 'string' || !rel.trim()) { fail('PATH', `${list}: empty or not a string`); return null; }
  const posix = toPosix(rel);
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || posix.startsWith('/')) { fail('PATH', `${list}: absolute path "${rel}"`); return null; }
  if (posix.split('/').includes('..')) { fail('PATH', `${list}: ".." in "${rel}"`); return null; }
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) { fail('PATH', `${list}: outside the repository "${rel}"`); return null; }
  if (isAgentPath(posix)) { fail('AGENT_FILE', `${list}: agent file "${rel}". The protocol never changes agent files.`); return null; }
  return posix;
}

if (plan.error) {
  fail('JSON', plan.error);
} else {
  const v = plan.value ?? {};
  for (const field of ['repository', 'sourceLockfile', 'pnpmVersion']) {
    if (typeof v[field] !== 'string' || !v[field]) fail('FIELD', `"${field}" is missing`);
  }
  for (const field of ['deleteFiles', 'createFiles', 'editFiles', 'npmReferences']) {
    if (!Array.isArray(v[field])) fail('FIELD', `"${field}" must be an array`);
  }

  if (typeof v.sourceLockfile === 'string') {
    if (!SOURCE_LOCKFILES.includes(path.basename(v.sourceLockfile))) fail('SOURCE_LOCKFILE', `Not a supported lockfile: ${v.sourceLockfile}`);
    else if (!exists(path.join(root, v.sourceLockfile))) fail('SOURCE_LOCKFILE', `Not found in the repository: ${v.sourceLockfile}`);
  }
  if (typeof v.pnpmVersion === 'string') {
    if (!isExactSemver(v.pnpmVersion)) fail('PNPM_VERSION', `Not an exact version: ${v.pnpmVersion}`);
    else if (semverMajor(v.pnpmVersion) < MIN_PNPM_MAJOR) fail('PNPM_VERSION', `Earlier than pnpm ${MIN_PNPM_MAJOR}: ${v.pnpmVersion}`);
  }

  if (v.releaseAgeOption === undefined) warn('RELEASE_AGE_OPTION', '"releaseAgeOption" is missing. Run release-age.mjs and record the option.');
  else if (!RELEASE_AGE_OPTIONS.includes(v.releaseAgeOption)) fail('RELEASE_AGE_OPTION', `Not one of ${RELEASE_AGE_OPTIONS.join(', ')}: ${v.releaseAgeOption}`);
  if (exists(path.join(root, '.npmrc')) && !(Array.isArray(v.npmrcTranslation) && v.npmrcTranslation.length)) {
    warn('NPMRC_TRANSLATION', 'The repository has .npmrc and "npmrcTranslation" is empty. Translate each line (reference/migrate.md).');
  }

  const referencedFiles = new Set();
  for (const ref of Array.isArray(v.npmReferences) ? v.npmReferences : []) {
    const file = String(ref).replace(/:\d+$/, '');
    const posix = checkPath('npmReferences', file);
    if (posix) referencedFiles.add(posix);
  }
  for (const rel of Array.isArray(v.deleteFiles) ? v.deleteFiles : []) {
    const posix = checkPath('deleteFiles', rel);
    if (posix && !DELETABLE.has(path.posix.basename(posix))) fail('DELETE', `Only lockfiles, node_modules and an empty .npmrc can be deleted: "${rel}"`);
  }
  // VS Code tasks of type "npm" (step 12 of reference/migrate.md): .vscode/settings.json gets "npm.packageManager".
  const npmTasks = referencedFiles.has('.vscode/tasks.json');
  for (const rel of Array.isArray(v.createFiles) ? v.createFiles : []) {
    const posix = checkPath('createFiles', rel);
    if (posix && !CREATABLE.has(posix) && !(npmTasks && posix === '.vscode/settings.json')) fail('CREATE', `File not permitted: "${rel}"`);
    if (posix === '.github/workflows/node-security.yml' && !exists(path.join(root, '.github', 'workflows'))) {
      warn('CI_WORKFLOW', 'The repository does not use GitHub Actions. Create the workflow only if the user approves it.');
    }
  }
  for (const rel of Array.isArray(v.editFiles) ? v.editFiles : []) {
    const posix = checkPath('editFiles', rel);
    if (posix && !EDITABLE_NAMES.has(path.posix.basename(posix)) && !referencedFiles.has(posix)
      && !(npmTasks && posix === '.vscode/settings.json')) {
      fail('EDIT', `File not permitted and not in npmReferences: "${rel}"`);
    }
  }
  if (typeof v.sourceLockfile === 'string' && Array.isArray(v.deleteFiles)
    && !v.deleteFiles.map((f) => toPosix(String(f))).includes(toPosix(v.sourceLockfile))) {
    warn('CONSISTENCY', 'sourceLockfile is not in deleteFiles. The old lockfile stays after the migration.');
  }
}

const failed = results.some((r) => r.level === 'FAIL');
const report = { protocolVersion: PROTOCOL_VERSION, plan: path.resolve(planFile), repository: root, result: failed ? 'FAIL' : 'PASS', results };
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`node-security validate-plan (protocol ${PROTOCOL_VERSION})`);
  console.log(`Plan: ${report.plan}\nRepository: ${root}\n`);
  if (results.length) printTable(results, ['level', 'id', 'detail']);
  console.log(`\nResult: ${report.result}`);
}
process.exit(failed ? 1 : 0);
