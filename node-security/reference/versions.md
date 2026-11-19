# Versions and verified behavior

Reviewed: 2026-11-19. This is the only file in this skill with version-specific data.

## Current versions (npm registry, 2026-11-19)

| Tool | Tag | Version | Note |
|---|---|---|---|
| pnpm | `latest` | 12.21.0 | Rust implementation. Same settings and lockfile format as pnpm 11. |
| pnpm | `latest-11` | 11.28.12 | Maintenance line. Requires Node.js 22 or later. |
| npm | `latest` | 12.2.3 | Dependency install scripts are off by default. Not bundled with Node.js LTS. |
| npm | `next-11` | 11.21.3 | Bundled with Node.js 24 LTS (11.x). Install scripts run by default. |
| npm | bundled with Node.js 22 | 10.9.x | No `min-release-age`, no `allowScripts`. |

Minimum versions for this skill: pnpm 11.0.0, npm 12.0.0 (scenario `npm` only).

## Verified behavior

Tests done on 2026-11-19 with Node.js 22.23.5.

| Behavior | Versions tested | Result |
|---|---|---|
| `devEngines.packageManager` with `name: pnpm` and `onFail: error` stops `npm install`, `npm ci` and `npm exec` | npm 10.9.9, 11.21.3, 12.2.3 | Stops with `EBADDEVENGINES` |
| `devEngines.packageManager` with `name: npm`, `version: ">=12.0.0"` and `onFail: error` | npm 10.9.9, 11.21.3 stop; 12.2.3 continues | As expected |
| A dependency with `binding.gyp` and no install script (implicit `node-gyp rebuild`) | pnpm 11.28.12, 12.21.0 | Blocked with `ERR_PNPM_IGNORED_BUILDS` |
| The same dependency, with a build approval | pnpm 12.21.0 | `node-gyp rebuild` runs |
| `allowBuilds` key for a `file:` dependency | pnpm 12.21.0 | Needs the full specifier, for example `"name@file:../path": true`. A name-only key has no effect. |
| Hardened `pnpm-workspace.yaml` template | pnpm 12.21.0 | Accepted, no unknown-key warning |
| Hardened `.npmrc` template (`min-release-age`, `allow-git`, `allow-remote`) | npm 12.2.3 | Accepted |
| A dependency `postinstall` script without approval | npm 12.2.3 | Blocked, with a warning |
| `npm install-scripts approve <package>` | npm 12.2.3 | Writes a pinned entry (`esbuild@0.25.0: true`) in `allowScripts` of `package.json`. `npm approve-scripts` is an older alias. |

## Old patterns

<details>
<summary>pnpm 10</summary>

pnpm 10 used `onlyBuiltDependencies`, `neverBuiltDependencies` and `ignoredBuiltDependencies`. pnpm 11 replaced them with `allowBuilds`. pnpm 10 read settings from `.npmrc` and from the `pnpm` field of `package.json`. pnpm 11 reads settings from `pnpm-workspace.yaml` only. `.npmrc` keeps authentication and registry settings.
</details>
