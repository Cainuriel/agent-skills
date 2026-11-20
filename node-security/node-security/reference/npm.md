# Scenario: npm

Use this scenario only when the user gives a reason to keep npm in an own repository. Record the reason in `README.md`.

## Checklist

```
- [ ] 1. Record the reason
- [ ] 2. Check the npm version
- [ ] 3. Set devEngines
- [ ] 4. Create .npmrc
- [ ] 5. Release-age exceptions (only if necessary)
- [ ] 6. Review install scripts
- [ ] 7. Validate
```

## Steps

1. **Record the reason.** Add one line to `README.md`: the reason to use npm and the date.
2. **Check the npm version.** Run `npm -v`. npm 12 or later is necessary. Node.js LTS does not include npm 12. If the version is earlier than 12, tell the user. Do not continue until the user installs npm 12 or later.
3. **Set devEngines.** In `package.json`, add:

   ```json
   {
     "devEngines": {
       "packageManager": { "name": "npm", "version": ">=12.0.0", "onFail": "error" }
     }
   }
   ```

   With this field, npm 10 and npm 11 stop in this repository (verified, see [versions.md](versions.md)).
4. **Create .npmrc.** Copy `assets/npmrc.hardened` to `.npmrc` at the root of the repository. Keep the comments. Do not add `ignore-scripts=true`. In npm 12, `ignore-scripts` overrides the approval list and also stops the scripts of the project.
5. **Release-age exceptions.** Do these only with "Release-age exceptions" in SKILL.md. In npm, an exception is a package name (`min-release-age-exclude[]=<name>`) and covers all versions of the package. Do not use patterns.
6. **Review install scripts.** Run `npm install-scripts ls`. For each package in the list:
   1. Tell the user the package and the reason for its script.
   2. If the user approves, run `npm install-scripts approve <package>`. npm writes a pinned entry (`<package>@<version>`) in the `allowScripts` field of `package.json`. Do not use `--no-allow-scripts-pin`: a name-only approval also covers future versions.
   3. If the user does not approve, run `npm install-scripts deny <package>`.
7. **Validate.** Do Step 5 of SKILL.md.

## Frozen repositories

If the repository is not active, do only steps 1 and 4. Add "frozen" to the line in `README.md`.
