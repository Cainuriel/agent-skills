# Scenario: new

Use this scenario for a new own repository.

## Checklist

```
- [ ] 1. Get the current pnpm version
- [ ] 2. Create or update package.json
- [ ] 3. Create pnpm-workspace.yaml
- [ ] 4. Add the CI workflow (GitHub Actions only)
- [ ] 5. Install dependencies
- [ ] 6. Review build approvals
- [ ] 7. Validate
```

## Steps

1. Run `pnpm view pnpm dist-tags --json` and `pnpm view pnpm time --json`. Use the version of the `latest` tag if it was published 3 days ago or more. If it is younger, use the most recent version of the same major that was published 3 days ago or more. Tell the user the version and its publication date.
2. In `package.json`, set these fields. Use the exact version from step 1.

   ```json
   {
     "packageManager": "pnpm@<exact-version>",
     "devEngines": {
       "packageManager": { "name": "pnpm", "onFail": "error" }
     }
   }
   ```

   `devEngines` stops `npm install`, `npm ci` and `npm exec` in this repository (verified, see [versions.md](versions.md)).
3. Copy `assets/pnpm-workspace.yaml` to the root of the repository. Keep the comments.
4. If the repository has `.github/workflows`, copy `assets/node-security.workflow.yml` to `.github/workflows/node-security.yml`. If the repository has no CI configuration, ask the user before you create the file. If the repository uses a different CI system, tell the user. Do not create a file for it.
5. Run `pnpm install`. If pnpm reports `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, a dependency has no version with the release age in the range of `package.json`. Tell the user the package. Recommend a range that includes an older version, or wait. For an exception, see "Release-age exceptions" in SKILL.md.
6. If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, use the principle of least privilege: approve a build only if the project needs it.
   1. Tell the user each package, the script that it runs (read the `scripts` field in `node_modules/<package>/package.json`) and why it needs a build (for example, a native module).
   2. Recommend this method: deny all builds, then run the build and the tests of the project. Many packages include prebuilt native binaries, thus their scripts are often not necessary.
   3. If the user agrees, run `pnpm approve-builds '!<package>'` for each package, then the build and the tests.
   4. If a tool fails, find the package that it needs. Tell the user. If the user approves, set that package to `true` in `allowBuilds` and run `pnpm rebuild <package>`. For a `file:` dependency, the key in `allowBuilds` must be the full specifier.
   5. Tell the user that development commands (for example `pnpm start` or a watch mode) can need a package that the build and the tests do not need.
7. Do Step 5 of SKILL.md (validation).
