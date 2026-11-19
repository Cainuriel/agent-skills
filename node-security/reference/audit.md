# Scenario: audit

Use this scenario to check an own repository that uses pnpm. This scenario does not change files.

## Steps

1. Run exactly:

   ```
   node <skill-dir>/scripts/check-policy.mjs
   ```

2. Give the user the result in the report format of SKILL.md.
3. For each finding, give the correction. Do not apply a correction. If the user asks for corrections, use [new.md](new.md) or [migrate.md](migrate.md).
4. If the repository publishes packages, add this residual risk to the report: "Publication controls are not in the scope of this protocol version (two-factor authentication, trusted publishing, a publish job separate from dependency installation)."
