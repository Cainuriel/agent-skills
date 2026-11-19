# Scenario: machine

Use this scenario to configure the user's computer one time. First, report only. Change nothing before approval.

## Environments

Windows and WSL are different environments. Each has its own home directory and its own configuration. Do these steps in each environment that the user uses.

## Checklist

```
- [ ] 1. Report the current configuration
- [ ] 2. Get approval
- [ ] 3. Configure pnpm
- [ ] 4. Configure npm
- [ ] 5. Report hygiene items
```

## Steps

1. **Report the current configuration.** Run these commands. They only read:

   ```
   pnpm -v
   npm -v
   pnpm config get minimum-release-age --location global
   pnpm config get trust-policy --location global
   npm config get min-release-age --location user
   npm config get allow-git --location user
   npm config get allow-remote --location user
   ```

   Tell the user the current values and the values of steps 3 and 4.
2. **Get approval.**
3. **Configure pnpm.**

   ```
   pnpm config set --location global minimum-release-age 4320
   pnpm config set --location global trust-policy no-downgrade
   ```

   A repository can override these values in its `pnpm-workspace.yaml`. Thus, scenario `foreign` inspects that file.
4. **Configure npm.** Copy the settings of `assets/npmrc.hardened` into the user-level `~/.npmrc`. Do not remove other lines. Do not add authentication tokens. These settings protect `npx` and `npm exec` outside a project.
5. **Report hygiene items.** Tell the user these items. Do not change anything.
   - Keep private keys and recovery phrases out of the development computer. Use a hardware wallet or a secret manager.
   - Use tokens with a short lifetime and the minimum scope.
   - Keep cloned foreign repositories in a separate folder.
