# Changelog

All notable changes to the `node-security` skill. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/). Versions 0.x are pre-releases and are not signed.

## [0.1.6] - 2026-11-21

### Changed

- Documentation reviewed for publication: status, scenarios, permissions and a validation status section in the README. New `CONTRIBUTING.md`, `SECURITY.md` and this changelog.
- The skill description also triggers before the scripts of a repository that the user did not write are run.
- `validate-plan.mjs` permits `.vscode/settings.json` in a migration plan only when the plan refers to VS Code tasks of type `npm`.

## [0.1.5] - 2026-11-21

### Changed

- The recommendation line of `inspect-repo.mjs` no longer assumes that the repository is foreign. The agent applies the scenario.

## [0.1.4] - 2026-11-21

### Added

- `inspect-repo.mjs` inspects `.vscode` files and `*.code-workspace` files: folder-open tasks, hidden tasks, settings that name an executable or a command, attempts to enable automatic tasks or change workspace trust, agent auto-approval settings, debug configurations, MCP servers and recommended extensions.
- Executables at the repository root with the name of a common tool (`git.exe`, `npm.cmd` and others).
- A map of what each `package.json` script runs, through `npm run`, `concurrently`, `run-p` and environment wrappers: repository files, tools, inline code, downloads and remote packages.
- Detection of code hidden after 100 or more blank characters in all source files, and obfuscation indicators in the files that scripts run and in the configuration files that tools load.
- VS Code hygiene in the `machine` report: automatic tasks off, no wide trusted folders, word wrap on, extension publishers.
- `corepack disable pnpm` before the installation of pnpm.
- Build approvals by least privilege: deny all, then approve only what the build, the tests or the development commands need.
- `inspect-repo.mjs` also runs in the `audit` scenario.
- VS Code tasks of type `npm` count as npm references in a migration.

### Changed

- Migration order: `packageManager` names pnpm before any `pnpm` command, because pnpm stops with `ERR_PNPM_OTHER_PM_EXPECTED` while it names npm.
- In the `foreign` scenario, the agent never runs the scripts of the repository.

## [0.1.3] - 2026-11-20

### Fixed

- npm references: `npx` as a JSON value (`"command": "npx"`) and `npx` with options (`npx -y`).

## [0.1.2] - 2026-11-20

### Added

- Detection and resumption of a migration that is not complete.
- `check-policy.mjs`: `NPMRC_TRANSLATION` (FAIL) for npm keys that pnpm ignores, `NPM_REFERENCES` (WARN) for npm commands left in the repository.
- `lock-diff.mjs`: version changes between the old lockfile and the current lockfile.

### Changed

- A report cannot state that a scenario is complete while a validation finding is open.
- The commit message format follows the configuration of the user's agent.

## [0.1.1] - 2026-11-20

### Added

- `release-age.mjs`: lockfile entries younger than the release age, with the date when each one becomes installable.
- Release-age block procedure with three options in a fixed sequence: wait, resolve again, exception.
- Release-age exceptions: last option, exact versions only, never for a version younger than 24 hours, approval that names the packages, `STALE_EXCLUDE` when no longer necessary.
- Tool versions and preconditions in `detect.mjs`, including npm release-age control (npm 11.10.0 or later).
- Translation table from `.npmrc` to `pnpm-workspace.yaml`.

### Changed

- Deletion of `node_modules` with Node.js on all operating systems (long paths on Windows).
- The agent asks before it creates a CI workflow in a repository without GitHub Actions.
- An installed tool runs with `pnpm exec`, not with `pnpm dlx`.

## [0.1.0] - 2026-11-19

### Added

- First version: six scenarios (`new`, `migrate`, `npm`, `foreign`, `audit`, `machine`), deterministic scripts (`detect.mjs`, `inspect-repo.mjs`, `check-policy.mjs`, `validate-plan.mjs`), hardened templates, CI workflow, installers, release tooling, unit tests and behavioral evaluations.
