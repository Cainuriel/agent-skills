#!/usr/bin/env node
// node-security detect: collects repository facts and proposes a scenario. Read-only.
// Usage: node detect.mjs [repo-path] [--owners owner1,owner2]
// Output: JSON on stdout. Exit code 0, or 2 on a usage error.

import path from 'node:path';
import {
  PROTOCOL_VERSION, exists, readJsonSafe, readGitRemote, lockfilesAtRoot, parseArgs,
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
} else if (hasPnpmLock) {
  scenario = 'audit';
  reason = 'Own repository with pnpm-lock.yaml.';
} else {
  scenario = 'new';
  reason = 'Own repository with package.json and no lockfile.';
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
  },
  proposal: { scenario, reason },
};

console.log(JSON.stringify(result, null, 2));
