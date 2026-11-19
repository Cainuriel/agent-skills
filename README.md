# agent-skills

Security-focused [Agent Skills](https://agentskills.io) for AI coding agents.

A skill is a folder with a `SKILL.md` file and optional scripts, references and templates. Any agent that implements the open Agent Skills format (Claude Code, GitHub Copilot, OpenAI Codex, Gemini CLI, Kimi Code and others) can load it.

## Skills

| Folder | Skill | Purpose | Status |
|---|---|---|---|
| [`node-security/`](node-security/) | `node-security` | Supply-chain security protocol for Node.js and JavaScript repositories | 0.1.0, draft, not signed |

## Repository layout

Each skill has its own folder. The folder contains the documentation, the tests and the evaluations of the skill, and the installable skill folder with the same name.

```
agent-skills/
├── README.md                  This file: catalog, installation, release verification
├── LICENSE                    Apache License 2.0
├── install.ps1                Installer for Windows
├── install.sh                 Installer for Linux, macOS and WSL
└── <skill>/
    ├── README.md              Documentation of the skill
    ├── <skill>/               The installable skill: the only folder that agents load
    ├── tests/                 Unit tests of the skill scripts
    └── evals/                 Behavioral evaluations for agents
```

The installable folder has the same name as the skill, because the Agent Skills format requires that the `name` field matches the folder name. Tests and evaluations stay in the repository.

To add a skill, create `<skill>/<skill>/SKILL.md`, add the documentation, tests and evaluations, and add a row to the table in "Skills".

## Installation

Install a skill once per machine, not once per project. The installers link the skill folder into the user-level folders that agents read:

| Folder | Read by |
|---|---|
| `~/.agents/skills/` | GitHub Copilot, OpenAI Codex, Gemini CLI, Kimi Code |
| `~/.claude/skills/` | Claude Code (and GitHub Copilot) |

1. Clone this repository and check out a release tag, not `main`.
2. Run the installer:

   ```powershell
   # Windows (directory junctions, no administrator rights needed)
   .\install.ps1 -Skill node-security
   ```

   ```sh
   # Linux, macOS, WSL (symbolic links)
   sh install.sh node-security
   ```

3. Restart the agent sessions.

The installers copy nothing and delete no folder. They warn if the repository is not at a release tag, and they stop if a `SHA256SUMS` manifest exists and a file does not match. To remove the links, add `-Uninstall` (Windows) or `--uninstall` (Linux, macOS, WSL).

WSL is a separate environment with its own home folder. Run `install.sh` inside WSL too. The link can point to the same clone on the Windows file system (`/mnt/c/...`).

If PowerShell refuses to run the script because of the execution policy, run it for this process only: `powershell -ExecutionPolicy Bypass -File .\install.ps1 -Skill node-security`. Read the script first.

For cloud applications that do not read your file system (for example the Claude or Kimi apps), upload the release archive of the skill as published. Some applications do not keep user skills between sessions: keep the archive. Do not ask an agent to recreate or rewrite the skill: the result is an unverified derivative.

## Release verification (planned for 1.0.0)

Each release is signed by the maintainer. Verification is optional and does not change how the skill works.

| Level | What it proves | How |
|---|---|---|
| Integrity | The files match the release manifest | `sha256sum -c SHA256SUMS` |
| Authorship | The maintainer signed the manifest | EIP-191 signature check (for example `cast wallet verify`, or the Etherscan signature verification page) |

The signed message has this form:

```
<skill>|<version>|commit:<git-commit>|sha256:<hash-of-SHA256SUMS>
```

Get the maintainer address from a channel outside this repository (see "Maintainer identity"). An attacker who controls the repository can replace the files, the manifest, the signature and an address written here. Only an address from an independent channel detects that.

Signing policy:

- One signing key, held offline. There is no key rotation and no revocation on request.
- If the key is lost, no new release is possible. A new skill under a new name replaces it.
- If the key is compromised, the maintainer publishes a pre-signed annulment statement. After that, do not trust any release signed with that address.

## Maintainer identity

Maintainer: Fernando López ([@cainuriel](https://github.com/cainuriel)).

The signing address and its `did:pkh` identifier will be published with the first signed release, in this file and in at least one channel outside GitHub.

## Contributing

Contributions are welcome through pull requests. The maintainer reviews every change. Only the maintainer signs releases. A merged change is not part of a signed release until the next release.

Pull requests that change security defaults (for example the minimum release age or the build approval rules) must explain the reason.

## Security

Report vulnerabilities privately through GitHub security advisories of this repository. Do not open a public issue for a vulnerability.

## License

Apache License 2.0. See [LICENSE](LICENSE).
