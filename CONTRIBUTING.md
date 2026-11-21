# Contributing

Thank you for your time. This repository contains security skills: a review is as valuable as code.

## Reviews

The skills are pre-releases under peer review. These reviews help most:

1. **False positives.** Run the read-only scripts on your own repositories and report findings that are not correct. From the root of a repository:

   ```
   node <path-to-clone>/node-security/node-security/scripts/inspect-repo.mjs
   node <path-to-clone>/node-security/node-security/scripts/check-policy.mjs
   node <path-to-clone>/node-security/node-security/scripts/detect.mjs --owners <your-github-owner>
   ```

   The scripts read files only. `inspect-repo.mjs` and `check-policy.mjs` do not use the network. `detect.mjs` runs `--version` of the package managers.
2. **Missing attack vectors.** A technique that the protocol does not cover, with a public source.
3. **Operating systems.** Results on macOS and Linux distributions. The tests were run on Windows and Linux.
4. **Agents.** Results of the behavioral evaluations with agents and models other than the ones in the README (see "Behavioral evaluations" in the skill README).
5. **Design.** Comments on the scenarios, the permissions and the release signing design.

## How to report

Open an issue with:

- the skill and its version (`metadata.version` in `SKILL.md`),
- the operating system, the Node.js version and the package manager versions,
- for a false positive: the finding line exactly as the script prints it, and why it is not correct. Remove private paths and names.

For a vulnerability, do not open an issue. See [SECURITY.md](SECURITY.md).

## Pull requests

- The maintainer reviews every change. Only the maintainer signs releases. A merged change is not part of a signed release until the next release.
- A pull request that changes a security default (for example the minimum release age or the build approval rules) must explain the reason.
- Run the unit tests before you open a pull request: `node --test tests/scripts.test.mjs tests/evals.test.mjs` from the skill documentation folder.
- Write identifiers, file names, paths and code comments in English. Write the skill instructions in simple, direct English: one instruction per sentence, active voice, the same term for the same thing.
- Do not commit trap fixtures (files with injected instructions, editor auto-run tasks or hidden code). Generate them at runtime in the system temporary directory, as the existing tests do.

## License

By contributing, you agree that your contribution is licensed under the [Apache License 2.0](LICENSE).
