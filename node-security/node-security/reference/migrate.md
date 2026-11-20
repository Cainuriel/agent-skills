# Scenario: migrate

Use this scenario to move an own repository from npm or Yarn to pnpm. Keep the versions of the current lockfile. Resolve dependencies again only with option B of "Release-age block", and only after approval.

## Checklist

```
- [ ] 1. Check preconditions
- [ ] 2. Check the release age
- [ ] 3. Write the migration plan
- [ ] 4. Validate the plan
- [ ] 5. Get approval
- [ ] 6. Import the lockfile
- [ ] 7. Remove the old lockfile and node_modules
- [ ] 8. Apply the templates and translate .npmrc
- [ ] 9. Install and review build approvals
- [ ] 10. Correct undeclared dependencies
- [ ] 11. Update references to npm
- [ ] 12. Validate
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
   - `npmReferences`: search the repository for `npm run`, `npm ci`, `npm install`, `npx` and `package-lock.json`. Exclude `node_modules`.
4. **Validate the plan.** Run exactly:

   ```
   node <skill-dir>/scripts/validate-plan.mjs <plan-file>
   ```

   If the result is FAIL, correct the plan and run the command again.
5. **Get approval.** Show the plan to the user. Wait for approval. The plan deletes files.
6. **Import the lockfile.** Run `pnpm import`. This command reads the old lockfile and writes `pnpm-lock.yaml` with the same versions.
7. **Remove the old lockfile and node_modules.** Use Node.js on all operating systems. On Windows, `Remove-Item` and `rmdir` fail on long paths in `node_modules`. Run one command for each entry in `deleteFiles` and for `node_modules`:

   ```
   node -e "require('fs').rmSync('<path>', { recursive: true, force: true })"
   ```

8. **Apply the templates and translate .npmrc.** Do steps 2 to 4 of [new.md](new.md). Then apply `npmrcTranslation` (see "Translate .npmrc").
9. **Install and review build approvals.** Run `pnpm install --frozen-lockfile`. If pnpm reports `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, do "Release-age block". Then do step 6 of [new.md](new.md).
10. **Correct undeclared dependencies.** Run the build and the tests of the repository. If an error says that a module is not found, the code uses a dependency that `package.json` does not declare. Add that dependency to `package.json` with the version that the old lockfile used. Run the build and the tests again.
11. **Update references to npm.** For each entry in `npmReferences`, change the command to pnpm:

    | npm | pnpm |
    |---|---|
    | `npm install` | `pnpm install` |
    | `npm ci` | `pnpm install --frozen-lockfile` |
    | `npm run <script>` | `pnpm run <script>` |
    | `npx <bin>` (package in `package.json`) | `pnpm exec <bin>` |
    | `npx <package>` (package not in `package.json`) | `pnpm dlx <package>@<exact-version>` |

    Also check framework configuration. Example: in an Angular repository, set `cli.packageManager` to `pnpm` in `angular.json`. In a Dockerfile, copy `pnpm-workspace.yaml` into the image and install pnpm with the exact version.
12. **Validate.** Do Step 5 of SKILL.md.

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
2. Delete `pnpm-lock.yaml` and `node_modules` with the `node -e` command of step 7. pnpm 12 checks an existing lockfile against the release age also without `--frozen-lockfile`, thus the lockfile must be deleted.
3. Run `pnpm install`.
4. Compare the versions of the direct dependencies with the old lockfile (`git show HEAD:package-lock.json`). Tell the user each difference.
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

## Tools that need a flat node_modules

Some tools expect the npm layout (for example React Native Metro, some bundlers, some Electron and serverless packaging tools). If a tool fails because of the layout:

1. Tell the user the tool and the error.
2. If the user approves, add `nodeLinker: hoisted` to `pnpm-workspace.yaml`.
3. Add one line to `README.md` that records this exception and the reason.
