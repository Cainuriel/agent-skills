# Scenario: audit

Use this scenario to check an own repository that uses pnpm. This scenario does not change files.

## Steps

1. Run exactly:

   ```
   node <skill-dir>/scripts/check-policy.mjs
   node <skill-dir>/scripts/release-age.mjs
   node <skill-dir>/scripts/inspect-repo.mjs
   ```

   `release-age.mjs` reads the npm registry. It checks the lockfile entries against `minimumReleaseAge` of the repository.
2. Give the user the result in the report format of SKILL.md. For each `release-age.mjs` finding, use this meaning:

   | Finding | Meaning |
   |---|---|
   | `BLOCKED` (FAIL) | The lockfile has entries younger than the release age. They were added with a weaker policy, or the policy changed. pnpm stops the next install. |
   | `EXCEPTION` (WARN) | Active exceptions. Report each one with its expiry date. |
   | `STALE_EXCLUDE` (WARN) | An exception that is not necessary now. Recommend that the user remove it. |
   | `EXCEPTION_TOO_YOUNG` (FAIL) | An exception covers a version younger than 24 hours. |
   | `EXCEPTION_PATTERN` (FAIL) | An exception without an exact version. It also covers future versions. |

   `inspect-repo.mjs` also applies to an own repository: a stolen account or a compromised contributor can add editor auto-run, hidden code or a changed script. Ask the user to confirm each `EDITOR_*`, `MCP_SERVER` and `SCRIPT_*` finding as intended. Report each `HIDDEN_CODE` and `ROOT_TOOL_BINARY` finding as an incident.

3. For each finding, give the correction. Do not apply a correction. If the user asks for corrections, use [new.md](new.md) or [migrate.md](migrate.md).
4. If the repository publishes packages, add this residual risk to the report: "Publication controls are not in the scope of this protocol version (two-factor authentication, trusted publishing, a publish job separate from dependency installation)."
