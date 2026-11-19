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

1. Run `pnpm view pnpm dist-tags --json`. Use the version of the `latest` tag. Tell the user the version.
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
4. If the repository uses GitHub Actions, copy `assets/node-security.workflow.yml` to `.github/workflows/node-security.yml`. If the repository uses a different CI system, tell the user. Do not create a file for it.
5. Run `pnpm install`.
6. If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, do these steps for each package in the list:
   1. Tell the user the package name and why it needs a build (for example, a native module).
   2. If the user approves, run `pnpm approve-builds <package>`. For a `file:` dependency, the key in `allowBuilds` must be the full specifier.
   3. If the user does not approve, run `pnpm approve-builds '!<package>'`.
7. Do Step 5 of SKILL.md (validation).
