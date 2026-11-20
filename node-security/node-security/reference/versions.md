# Versions and verified behavior

Reviewed: 2026-11-20. This is the only file in this skill with version-specific data.

## Current versions (npm registry, 2026-11-20)

| Tool | Tag | Version | Published | Note |
|---|---|---|---|---|
| pnpm | `latest` | 12.21.0 | 2026-11-13 | Rust implementation. Same settings and lockfile format as pnpm 11. |
| pnpm | `next-12` | 12.22.0 | 2026-11-17 | Pre-release line. |
| pnpm | `latest-11` | 11.28.12 | | Maintenance line. Requires Node.js 22 or later. |
| npm | `latest` | 12.2.3 | 2026-11-18 | Dependency install scripts are off by default. Not bundled with Node.js LTS. Node.js `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`. |
| npm | `next-11` | 11.21.3 | 2026-11-18 | Bundled with Node.js 24 LTS (11.x). Install scripts run by default. Node.js `^20.17.0 \|\| >=22.9.0`. |
| npm | bundled with Node.js 22 | 10.9.x | | No `min-release-age`, no `allow-git`, no `allowScripts`. |
| Corepack | bundled with Node.js 22 and 24 | 0.36.0 (Node.js 22.23.5) | | Not included in Node.js 25 and later. |

Minimum versions for this skill: pnpm 11.0.0, npm 12.0.0 (scenario `npm` only). Release-age control in npm: 11.10.0.

## Verified behavior

Tests done on 2026-11-19 and 2026-11-20 with Node.js 22.23.5.

### Package manager selection

| Behavior | Versions tested | Result |
|---|---|---|
| `devEngines.packageManager` with `name: pnpm` and `onFail: error` stops `npm install`, `npm ci` and `npm exec` | npm 10.9.9, 11.21.3, 12.2.3 | Stops with `EBADDEVENGINES` |
| `devEngines.packageManager` with `name: npm`, `version: ">=12.0.0"` and `onFail: error` | npm 10.9.9, 11.21.3 stop; 12.2.3 continues | As expected |
| pnpm uses the version in `packageManager` of `package.json` | pnpm 12.21.0 with `pnpm@11.28.12` | `pnpm -v` gives 11.28.12 |
| The pnpm package has install scripts | pnpm 12.21.0 | `preinstall` and `postinstall`: `node install.js`, with optional platform packages |

### Release age

| Behavior | Versions tested | Result |
|---|---|---|
| A lockfile entry younger than `minimumReleaseAge`, `pnpm install --frozen-lockfile` | pnpm 12.21.0 | Stops with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` |
| The same lockfile, `pnpm install` without `--frozen-lockfile` | pnpm 12.21.0 | Stops. pnpm checks an existing lockfile against the policy. |
| Lockfile deleted, `pnpm install` | pnpm 12.21.0 | Resolves the most recent version in the range that has the release age |
| `pnpm dlx <package>@<version>` with a version younger than the global `minimum-release-age` | pnpm 12.21.0 | Stops with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` |
| `minimumReleaseAgeExclude` with an exact version (`rollup@4.68.7`) | pnpm 12.21.0 | Covers only that version. Another version stays blocked. |
| `minimumReleaseAgeExclude` with a name or a scope pattern (`'@rollup/*'`) | pnpm 12.21.0 | Covers all versions, also future versions |
| Number of lockfile entries for one package with platform binaries | pnpm 12.21.0, `rollup@4.68.7` | 27 entries. An exception must name each entry. |
| `min-release-age=3` in `.npmrc` | npm 10.9.9 | Ignored without a warning. Installs a version younger than 3 days. |
| The same | npm 11.9.0 | Warning `Unknown project config`. Not applied. |
| The same | npm 11.10.0, 11.21.3 | Applied. Stops with `ETARGET`. |
| `min-release-age-exclude` | npm 12.2.3 (documentation) | Package names or `minimatch` patterns. No versions. |

### Settings and scripts

| Behavior | Versions tested | Result |
|---|---|---|
| A dependency with `binding.gyp` and no install script (implicit `node-gyp rebuild`) | pnpm 11.28.12, 12.21.0 | Blocked with `ERR_PNPM_IGNORED_BUILDS` |
| The same dependency, with a build approval | pnpm 12.21.0 | `node-gyp rebuild` runs |
| `allowBuilds` key for a `file:` dependency | pnpm 12.21.0 | Needs the full specifier, for example `"name@file:../path": true`. A name-only key has no effect. |
| Hardened `pnpm-workspace.yaml` template | pnpm 12.21.0 | Accepted, no unknown-key warning |
| `engineStrict`, `saveExact`, `strictPeerDependencies` in `pnpm-workspace.yaml` | pnpm 12.21.0 | Accepted. `engineStrict: true` stops with `ERR_PNPM_UNSUPPORTED_ENGINE`. An unknown key gives a warning. |
| `engine-strict=true` in `.npmrc` | pnpm 11.28.12, 12.21.0 | Ignored. pnpm 12 gives only a warning for an unsupported engine; pnpm 11 gives nothing. The engine check is off until `engineStrict: true` is in `pnpm-workspace.yaml`. |
| Hardened `.npmrc` template (`min-release-age`, `allow-git`, `allow-remote`) | npm 12.2.3 | Accepted |
| `allow-git=none` | npm 10.9.9 ignored; 11.21.3 applied | npm 11.21.3 stops a `github:` dependency |
| A dependency `postinstall` script without approval | npm 12.2.3 | Blocked, with a warning |
| `npm install-scripts approve <package>` | npm 12.2.3 | Writes a pinned entry (`esbuild@0.25.0: true`) in `allowScripts` of `package.json`. `npm approve-scripts` is an older alias. |

## Old patterns

<details>
<summary>pnpm 10</summary>

pnpm 10 used `onlyBuiltDependencies`, `neverBuiltDependencies` and `ignoredBuiltDependencies`. pnpm 11 replaced them with `allowBuilds`. pnpm 10 read settings from `.npmrc` and from the `pnpm` field of `package.json`. pnpm 11 reads settings from `pnpm-workspace.yaml` only. `.npmrc` keeps authentication and registry settings.
</details>
