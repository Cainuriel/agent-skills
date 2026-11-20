#!/usr/bin/env node
// node-security detect: collects repository facts and proposes a scenario. Read-only.
// Usage: node detect.mjs [repo-path] [--owners owner1,owner2]
// Output: JSON on stdout. Exit code 0, or 2 on a usage error.

import path from 'node:path';
import {
  PROTOCOL_VERSION, MIN_PNPM_MAJOR, MIN_NPM_AGE_CONTROL, NPMRC_TRANSLATIONS, exists, compareSemver, readJsonSafe,
  readTextSafe, parseNpmrc, readGitRemote, lockfilesAtRoot, parseArgs, semverMajor, toolVersion, findNpmReferences,
} from './lib/common.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args._[0] ?? process.cwd());
if (!exists(root)) {
  console.error(`Path not found: ${root}`);
  process.exit(2);
}
const owners = typeof args.owners === 'string'
  ? args.owners.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  : [];

const pkg = readJsonSafe(path.join(root, 'package.json'));
const lockfiles = lockfilesAtRoot(root);
const remote = readGitRemote(root);
const devEnginesPm = pkg.value?.devEngines?.packageManager ?? null;

let ownership = 'unknown';
if (remote.owner && owners.length > 0) {
  ownership = owners.includes(remote.owner.toLowerCase()) ? 'own' : 'foreign';
} else if (!remote.url && owners.length > 0) {
  ownership = 'own-local'; // No remote: a local repository of the user. Confirm with the user.
}

const hasPnpmLock = lockfiles.includes('pnpm-lock.yaml');
const hasForeignLock = lockfiles.some((f) => f !== 'pnpm-lock.yaml');

// Signs of a migration to pnpm that is not complete.
const pendingNpmrcKeys = Object.keys(parseNpmrc(readTextSafe(path.join(root, '.npmrc'))))
  .filter((k) => Object.hasOwn(NPMRC_TRANSLATIONS, k));
const npmReferences = pkg.missing ? [] : findNpmReferences(root);
const packageManager = typeof pkg.value?.packageManager === 'string' ? pkg.value.packageManager : null;
const pendingMigration = [];
if (pendingNpmrcKeys.length) pendingMigration.push(`.npmrc keys that pnpm ignores: ${pendingNpmrcKeys.join(', ')}`);
if (!packageManager?.startsWith('pnpm@')) pendingMigration.push(`packageManager is ${packageManager ?? 'missing'}`);
if (devEnginesPm?.name !== 'pnpm') pendingMigration.push('devEngines does not require pnpm');
if (npmReferences.length) pendingMigration.push(`${npmReferences.length} npm commands in ${new Set(npmReferences.map((r) => r.file)).size} files`);

let scenario;
let reason;
if (pkg.missing) {
  scenario = 'new';
  reason = 'No package.json.';
} else if (ownership === 'foreign') {
  scenario = 'foreign';
  reason = `Remote owner "${remote.owner}" is not in the list of own owners.`;
} else if (ownership === 'unknown') {
  scenario = 'ask-ownership';
  reason = 'Ownership is unknown. Ask the user which owners are own, then run again with --owners.';
} else if (hasForeignLock && devEnginesPm?.name === 'npm') {
  scenario = 'npm';
  reason = 'Own repository with an npm lockfile and devEngines that requires npm.';
} else if (hasForeignLock) {
  scenario = 'migrate';
  reason = `Own repository with ${lockfiles.filter((f) => f !== 'pnpm-lock.yaml').join(', ')}.`;
} else if (hasPnpmLock && (pendingNpmrcKeys.length || !packageManager?.startsWith('pnpm@'))) {
  scenario = 'migrate';
  reason = `Migration not complete: own repository with pnpm-lock.yaml and ${pendingMigration.join('; ')}. Do "Resume a migration" in reference/migrate.md.`;
} else if (hasPnpmLock) {
  scenario = 'audit';
  reason = 'Own repository with pnpm-lock.yaml.';
} else {
  scenario = 'new';
  reason = 'Own repository with package.json and no lockfile.';
}

// Tools on this computer. Read-only: each runs "<tool> --version".
const tools = {
  node: process.versions.node,
  pnpm: toolVersion('pnpm'),
  npm: toolVersion('npm'),
  corepack: toolVersion('corepack'),
};
const preconditions = [];
if (scenario !== 'foreign' && scenario !== 'ask-ownership') {
  if (!tools.pnpm) {
    preconditions.push('pnpm is not installed. Do the step "Install pnpm" in reference/machine.md before the scenario.');
  } else if ((semverMajor(tools.pnpm) ?? 0) < MIN_PNPM_MAJOR) {
    preconditions.push(`pnpm ${tools.pnpm} is earlier than ${MIN_PNPM_MAJOR}. Do the step "Install pnpm" in reference/machine.md.`);
  }
}

// npm before MIN_NPM_AGE_CONTROL ignores min-release-age (verified: 10.x without a warning).
const npmAgeControl = tools.npm ? compareSemver(tools.npm, MIN_NPM_AGE_CONTROL) >= 0 : false;
if (tools.npm && !npmAgeControl) {
  preconditions.push(`npm ${tools.npm} ignores min-release-age (it needs npm ${MIN_NPM_AGE_CONTROL} or later). npx, npm exec and npm install have no release-age control on this computer. See reference/machine.md.`);
}

const result = {
  protocolVersion: PROTOCOL_VERSION,
  path: root,
  facts: {
    hasPackageJson: !pkg.missing,
    packageJsonError: pkg.error,
    lockfiles,
    packageManagerField: pkg.value?.packageManager ?? null,
    devEnginesPackageManager: devEnginesPm,
    hasPnpmWorkspace: exists(path.join(root, 'pnpm-workspace.yaml')),
    hasNpmrc: exists(path.join(root, '.npmrc')),
    isGitRepo: remote.isGitRepo,
    gitRemote: remote.url,
    remoteOwner: remote.owner,
    ownership,
    usesGithubActions: exists(path.join(root, '.github', 'workflows')),
    tools,
    npmAgeControl,
    pendingMigration,
    npmReferences,
  },
  proposal: { scenario, reason, preconditions },
};

console.log(JSON.stringify(result, null, 2));
