# Scenario: machine

Use this scenario to configure the user's computer one time. First, report only. Change nothing before approval.

## Environments

Windows and WSL are different environments. Each has its own home directory, its own Node.js and its own configuration. Do these steps in each environment that the user uses.

## Checklist

```
- [ ] 1. Report the current configuration
- [ ] 2. Get approval
- [ ] 3. Install pnpm (if necessary)
- [ ] 4. Update npm (if necessary)
- [ ] 5. Configure pnpm
- [ ] 6. Configure npm
- [ ] 7. Report hygiene items
```

## Steps

1. **Report the current configuration.** Run these commands. They only read:

   ```
   node -v
   pnpm -v
   npm -v
   pnpm config get minimum-release-age --location global
   pnpm config get trust-policy --location global
   npm config get min-release-age --location user
   npm config get allow-git --location user
   npm config get allow-remote --location user
   ```

   Tell the user the current values and the values of steps 3 to 6. If pnpm is missing or earlier than 11, step 3 is necessary. If npm is earlier than 11.10.0, tell the user: npm ignores `min-release-age`, thus `npx`, `npm exec` and `npm install` have no release-age control on this computer. npm 10 ignores the setting without a warning (verified, see [versions.md](versions.md)).
2. **Get approval.**
3. **Install pnpm.** Do this step only if pnpm is missing or earlier than 11.
   1. Select the version. Run `npm view pnpm time --json`. Use the most recent version of the `latest` tag that was published 3 days ago or more. Do not use a version that is younger than 3 days. Tell the user the version and its publication date.
   2. Install it with the exact version:

      ```
      npm install -g pnpm@<exact-version>
      ```

      The pnpm package runs its own install script (`node install.js`). This is necessary. Tell the user.
   3. Run `pnpm -v`. The output must be the selected version.
   4. In a repository, pnpm uses the version in `packageManager` of `package.json`. It downloads that version if it is different.

   Corepack is an alternative only with Node.js 22 and 24. Node.js 25 and later do not include Corepack. If Node.js is installed for all users (on Windows, in `C:\Program Files\nodejs`), `corepack enable` needs an administrator terminal. Do not use Corepack if the user does not ask for it.
4. **Update npm.** Do this step only if npm is earlier than 11.10.0 and the user approves.
   1. Select the version. Run `npm view npm time --json` and `npm view npm@<version> engines --json`. Use the most recent version that was published 3 days ago or more and that supports the installed Node.js version.
   2. Run `npm install -g npm@<exact-version>`.
   3. Run `npm -v`. The output must be the selected version.
   4. Node.js updates replace the global npm with the bundled version. After a Node.js update, do this step again.
5. **Configure pnpm.**

   ```
   pnpm config set --location global minimum-release-age 4320
   pnpm config set --location global trust-policy no-downgrade
   ```

   A repository can override these values in its `pnpm-workspace.yaml`. Thus, scenario `foreign` inspects that file. `pnpm dlx` also uses these values (verified).
6. **Configure npm.** Copy the settings of `assets/npmrc.hardened` into the user-level `~/.npmrc`. Do not remove other lines. Do not add authentication tokens. These settings protect `npx` and `npm exec` outside a project. npm 10 ignores all of them. `min-release-age` needs npm 11.10.0 or later. `allow-git` works in npm 11.21.3 and 12.2.3 (verified).
7. **Report hygiene items.** Tell the user these items. Do not change anything.
   - Keep private keys and recovery phrases out of the development computer. Use a hardware wallet or a secret manager.
   - Use tokens with a short lifetime and the minimum scope.
   - Keep cloned foreign repositories in a separate folder.
