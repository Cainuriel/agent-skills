# Scenario: migrate

Use this scenario to move an own repository from npm or Yarn to pnpm. Do not resolve dependencies again during the migration. The versions in the current lockfile must stay the same.

## Checklist

```
- [ ] 1. Check preconditions
- [ ] 2. Write the migration plan
- [ ] 3. Validate the plan
- [ ] 4. Get approval
- [ ] 5. Import the lockfile
- [ ] 6. Remove the old lockfile and node_modules
- [ ] 7. Apply the templates
- [ ] 8. Install and review build approvals
- [ ] 9. Correct undeclared dependencies
- [ ] 10. Update references to npm
- [ ] 11. Validate
```

## Steps

1. **Check preconditions.** Run `git status --porcelain`. If the output is not empty, stop and tell the user. The migration needs a clean working tree. Recommend a new branch, for example `chore/pnpm-migration`.
2. **Write the migration plan.** Write a JSON file in the system temporary directory, not in the repository. Use this structure:

   ```json
   {
     "repository": "<name>",
     "sourceLockfile": "package-lock.json",
     "pnpmVersion": "<exact-version>",
     "deleteFiles": ["package-lock.json"],
     "createFiles": ["pnpm-workspace.yaml", ".github/workflows/node-security.yml"],
     "editFiles": ["package.json"],
     "npmReferences": ["<file>:<line>"]
   }
   ```

   To fill `npmReferences`, search the repository for `npm run`, `npm ci`, `npm install`, `npx` and `package-lock.json`. Exclude `node_modules`.
3. **Validate the plan.** Run exactly:

   ```
   node <skill-dir>/scripts/validate-plan.mjs <plan-file>
   ```

   If the result is FAIL, correct the plan and run the command again.
4. **Get approval.** Show the plan to the user. Wait for approval. The plan deletes files.
5. **Import the lockfile.** Run `pnpm import`. This command reads the old lockfile and writes `pnpm-lock.yaml` with the same versions.
6. **Remove the old lockfile and node_modules.** Delete the files in `deleteFiles` and the `node_modules` folders.
7. **Apply the templates.** Do steps 2 to 4 of [new.md](new.md).
8. **Install and review build approvals.** Run `pnpm install --frozen-lockfile`. Then do step 6 of [new.md](new.md).
9. **Correct undeclared dependencies.** Run the build and the tests of the repository. If an error says that a module is not found, the code uses a dependency that `package.json` does not declare. Add that dependency to `package.json` with the version that the old lockfile used. Run the build and the tests again.
10. **Update references to npm.** For each entry in `npmReferences`, change the command to pnpm:

    | npm | pnpm |
    |---|---|
    | `npm install` | `pnpm install` |
    | `npm ci` | `pnpm install --frozen-lockfile` |
    | `npm run <script>` | `pnpm run <script>` |
    | `npx <bin>` (installed) | `pnpm exec <bin>` |
    | `npx <package>` (not installed) | `pnpm dlx <package>@<exact-version>` |

    Also check framework configuration. Example: in an Angular repository, set `cli.packageManager` to `pnpm` in `angular.json`. In a Dockerfile, copy `pnpm-workspace.yaml` into the image and install pnpm with the exact version.
11. **Validate.** Do Step 5 of SKILL.md.

## Tools that need a flat node_modules

Some tools expect the npm layout (for example React Native Metro, some bundlers, some Electron and serverless packaging tools). If a tool fails because of the layout:

1. Tell the user the tool and the error.
2. If the user approves, add `nodeLinker: hoisted` to `pnpm-workspace.yaml`.
3. Add one line to `README.md` that records this exception and the reason.
