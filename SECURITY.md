# Security policy

## Report a vulnerability

Report vulnerabilities privately through the GitHub security advisories of this repository: "Security" tab, then "Report a vulnerability". Do not open a public issue.

Examples of vulnerabilities:

- a way to make an agent that follows a skill run code, change agent files or skip a user approval,
- a script of a skill that writes, runs repository code or uses the network when its documentation says that it does not,
- a way to bypass the release verification or the installer integrity check,
- a protocol rule that weakens the security of a repository.

A false positive or a missing detection is not a vulnerability: open an issue (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Supported versions

| Version | Supported |
|---|---|
| Latest pre-release (0.x) | Yes, until 1.0.0 |
| Signed releases (1.0.0 and later) | The latest release of each skill |

## Release integrity

Signed releases and their verification are described in "Release verification" in the [README](README.md#release-verification). If the signing key is compromised, the maintainer publishes a pre-signed annulment statement. After that, do not trust any release signed with that address.
