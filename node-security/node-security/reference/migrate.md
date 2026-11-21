# Scenario: migrate

Use this scenario to move an own repository from npm or Yarn to pnpm. Keep the versions of the current lockfile. Resolve dependencies again only with option B of "Release-age block", and only after approval.

## Checklist

```
- [ ] 1. Check preconditions
- [ ] 2. Check the release age
- [ ] 3. Write the migration plan
- [ ] 4. Validate the plan
- [ ] 5. Get approval
- [ ] 6. Set pnpm as the package manager
- [ ] 7. Import the lockfile
- [ ] 8. Remove the old lockfile and node_modules
- [ ] 9. Translate .npmrc
- [ ] 10. Install and review build approvals
- [ ] 11. Correct undeclared dependencies
- [ ] 12. Update references to npm
- [ ] 13. Validate
```

## Steps

1. **Check preconditions.**
   1. Run `git status --porcelain`. If the output is not empty, stop and tell the user. The migration needs a clean working tree. Recommend a new branch, for example `chore/pnpm-migration`.
   2. Read `proposal.preconditions` of `detect.mjs`. If pnpm is missing or earlier than 11, do the step "Install pnpm" of [machine.md](machine.md) first.
2. **Check the release age.** Run exactly:

   ```
   node <skill-dir>/scripts/release-age.mjs --min-age 4320
   ```

   The script reads the old lockfile and the npm registry. `pnpm import` keeps the versions of the old lockfile, thus pnpm blocks the same entries. If the result is FAIL, do "Release-age block" now, before the plan. Record the option that the user selects in the plan (`releaseAgeOption`).
3. **Write the migration plan.** Write a JSON file in the system temporary directory, not in the repository. Use this structure:

   ```json
   {
     "repository": "<name>",
     "sourceLockfile": "package-lock.json",
     "pnpmVersion": "<exact-version>",
     "releaseAgeOption": "none",
     "deleteFiles": ["package-lock.json"],
     "createFiles": ["pnpm-workspace.yaml"],
     "editFiles": ["package.json"],
     "npmrcTranslation": ["<key>=<value> -> <result>"],
     "npmReferences": ["<file>:<line>"]
   }
   ```

   - `releaseAgeOption`: `none` (no blocked entry), `wait`, `resolve-again` or `exception`.
   - `createFiles`: add `.github/workflows/node-security.yml` only if the repository has `.github/workflows`. If it does not have this folder, ask the user. `validate-plan.mjs` gives a warning in this case.
   - `npmrcTranslation`: one entry for each line of `.npmrc`. See "Translate .npmrc".
   - `npmReferences`: copy `facts.npmReferences` of `detect.mjs` (`<file>:<line>`). Also search for `package-lock.json` in Dockerfiles and CI files. Do not add an entry with `agentFile: true`: tell the user the file and the line. The user changes agent files.
4. **Validate the plan.** Run exactly:

   ```
   node <skill-dir>/scripts/validate-plan.mjs <plan-file>
   ```

   If the result is FAIL, correct the plan and run the command again.
5. **Get approval.** Show the plan to the user. Wait for approval. The plan deletes files.
6. **Set pnpm as the package manager.** Do steps 2 to 4 of [new.md](new.md): `packageManager` and `devEngines` in `package.json`, `pnpm-workspace.yaml` from the template, and the CI workflow only if the plan creates it. Do this step before any `pnpm` command. While `packageManager` names npm, pnpm stops every command, also `pnpm import`, with `ERR_PNPM_OTHER_PM_EXPECTED` (verified, see [versions.md](versions.md)).
7. **Import the lockfile.** If `releaseAgeOption` is `resolve-again`, do not import: there is no old lockfile to keep. Else run `pnpm import`. This command reads the old lockfile and writes `pnpm-lock.yaml` with the same versions.
8. **Remove the old lockfile and node_modules.** Use Node.js on all operating systems. On Windows, `Remove-Item` and `rmdir` fail on long paths in `node_modules`. Run one command for each entry in `deleteFiles` and for `node_modules`:

   ```
   node -e "require('fs').rmSync('<path>', { recursive: true, force: true })"
   ```

9. **Translate .npmrc.** Apply `npmrcTranslation` (see "Translate .npmrc").
10. **Install and review build approvals.** Run `pnpm install --frozen-lockfile`. With `releaseAgeOption` `resolve-again`, run `pnpm install`. If pnpm reports `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, do "Release-age block". Then do step 6 of [new.md](new.md).
11. **Correct undeclared dependencies.** Run the build and the tests of the repository. If an error says that a module is not found, the code uses a dependency that `package.json` does not declare. Add that dependency to `package.json` with the version that the old lockfile used. Run the build and the tests again.
12. **Update references to npm.** For each entry in `npmReferences`, change the command to pnpm:

    | npm | pnpm |
    |---|---|
    | `npm install` | `pnpm install` |
    | `npm ci` | `pnpm install --frozen-lockfile` |
    | `npm run <script>` | `pnpm run <script>` |
    | `npx <bin>` (package in `package.json`) | `pnpm exec <bin>` |
    | `npx <package>` (package not in `package.json`) | `pnpm dlx <package>@<exact-version>` |

    Also check framework configuration. Example: in an Angular repository, set `cli.packageManager` to `pnpm` in `angular.json`. For `.vscode/tasks.json` with `"type": "npm"`, add `"npm.packageManager": "pnpm"` to `.vscode/settings.json`: VS Code then runs these tasks with pnpm. In a Dockerfile, copy `pnpm-workspace.yaml` into the image and install pnpm with the exact version.
13. **Validate.** Do Step 5 of SKILL.md.

## Release-age block

The lockfile has entries that are younger than the release age. Give the user these options in this sequence. Use the output of `release-age.mjs`. Do not use `pnpm clean --lockfile` and do not lower `minimumReleaseAge`.

| Option | When | Result |
|---|---|---|
| A. Wait | Always possible. | Same versions as the old lockfile. Install after `allEligibleAt`. |
| B. Resolve again | `exactPinsEligibleAt` is in the past, or no exact pin is blocked. | pnpm selects the most recent version of each range that has the release age. Versions can be different from the old lockfile. |
| C. Exception | Only if the user rejects A and B. | Same versions as the old lockfile. See "Release-age exceptions" in SKILL.md. |

**Option A. Wait.** Tell the user the date and time of `allEligibleAt` in the local time zone. After that time, run `pnpm install --frozen-lockfile`.

**Option B. Resolve again.**

1. Tell the user that versions will change, and that the build and the tests must pass again.
2. Delete `pnpm-lock.yaml` and `node_modules` with the `node -e` command of step 8. pnpm 12 checks an existing lockfile against the release age also without `--frozen-lockfile`, thus the lockfile must be deleted.
3. Run `pnpm install`.
4. Compare the versions with the old lockfile. Write the old lockfile to the system temporary directory, not to the repository, and run exactly:

   ```
   git show <commit>:package-lock.json > <temp-dir>/old-package-lock.json
   node <skill-dir>/scripts/lock-diff.mjs <temp-dir>/old-package-lock.json
   ```

   `<commit>` is the last commit that has `package-lock.json`. Tell the user `directChanged` and the number of transitive changes.
5. Run `release-age.mjs` again. The result must be PASS.

An exact pin in `package.json` (for example `"@progress/kendo-licensing": "1.13.1"`) cannot change. If an exact pin is blocked, option B fails until `exactPinsEligibleAt`.

**Option C. Exception.** Do "Release-age exceptions" in SKILL.md.

## Translate .npmrc

pnpm 11 and later read settings from `pnpm-workspace.yaml`. `.npmrc` keeps only the registry and authentication. Translate each line of `.npmrc`:

| `.npmrc` (npm) | Result in pnpm |
|---|---|
| `registry=`, `@scope:registry=`, `//host/:_authToken=` | Keep in `.npmrc`. Do not show token values. |
| `engine-strict=true` | `engineStrict: true` in `pnpm-workspace.yaml`. |
| `save-exact=true` | `saveExact: true` in `pnpm-workspace.yaml`. |
| `strict-peer-deps=true` | `strictPeerDependencies: true` in `pnpm-workspace.yaml`. |
| `legacy-peer-deps=true` | Remove. pnpm has no equivalent. A peer dependency conflict gives a warning, not an error. Tell the user. |
| `ignore-scripts=true` | Remove. `strictDepBuilds` and build approvals replace it. |
| `min-release-age=<days>` | Remove. `minimumReleaseAge` of the template replaces it. |
| Other key | Ask the user. Do not guess a translation. |

If `.npmrc` is empty after the translation, delete it. Add `.npmrc` to `deleteFiles` in the plan.

## Resume a migration

Use this section when `detect.mjs` gives `migrate` with the reason "Migration not complete". The repository has `pnpm-lock.yaml`, but some steps of the migration are not done. `facts.pendingMigration` lists them.

1. Do step 1 (preconditions) and step 2 (release age) of the checklist.
2. For each step from 3 to 12, check if it is done. Tell the user the result as a list: done, or not done with the reason. Use these checks:

   | Step | Done if |
   |---|---|
   | 6. pnpm as the package manager | `packageManager` is `pnpm@<exact-version>`, `devEngines` requires pnpm, and `pnpm-workspace.yaml` exists. |
   | 7. Import the lockfile | `pnpm-lock.yaml` exists. |
   | 8. Remove the old lockfile | No `package-lock.json`, `npm-shrinkwrap.json` or `yarn.lock`. |
   | 9. `.npmrc` | `check-policy.mjs` gives no `NPMRC_TRANSLATION`. |
   | 10. Install and build approvals | `pnpm install --frozen-lockfile` passes. |
   | 11. Undeclared dependencies | The build and the tests pass. |
   | 12. References to npm | `facts.npmReferences` is empty, except entries with `agentFile: true`. |

3. Write the plan (step 3) with the steps that are not done. Validate it (step 4) and get approval (step 5).
4. Do the steps that are not done, in the sequence of the checklist.
5. Do step 13. The migration is complete only if `check-policy.mjs` gives no `NPMRC_TRANSLATION` and no `NPM_REFERENCES` finding, except references in agent files that the user keeps.

## Tools that need a flat node_modules

Some tools expect the npm layout (for example React Native Metro, some bundlers, some Electron and serverless packaging tools). If a tool fails because of the layout:

1. Tell the user the tool and the error.
2. If the user approves, add `nodeLinker: hoisted` to `pnpm-workspace.yaml`.
3. Add one line to `README.md` that records this exception and the reason.
