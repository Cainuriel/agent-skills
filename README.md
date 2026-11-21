# agent-skills

Security-focused [Agent Skills](https://agentskills.io) for AI coding agents.

A skill is a folder with a `SKILL.md` file and optional scripts, references and templates. Any agent that implements the open Agent Skills format (Claude Code, GitHub Copilot, OpenAI Codex, Gemini CLI, Kimi Code and others) can load it.

## Skills

| Folder | Skill | Purpose | Status |
|---|---|---|---|
| [`node-security/`](node-security/) | `node-security` | Supply-chain security protocol for Node.js and JavaScript repositories | 0.1.4, draft, not signed |

## Repository layout

Each skill has its own folder. The folder contains the documentation, the tests and the evaluations of the skill, and the installable skill folder with the same name.

```
agent-skills/
├── README.md                  This file: catalog, installation, release verification
├── LICENSE                    Apache License 2.0
├── install.ps1                Installer for Windows
├── install.sh                 Installer for Linux, macOS and WSL
├── tools/release/             Release tooling for the maintainer (manifest, message, signing page)
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

## Release verification

Each release is signed by the maintainer. Verification is optional and does not change how the skill works. Releases are annotated git tags named `<skill>-v<version>` (for example `node-security-v1.0.0`). The tag message and the GitHub release notes contain this block:

```
type: release
message: <skill>|<version>|commit:<git-commit>|sha256:<sha256-of-SHA256SUMS>
address: 0x<maintainer-address>
did: did:pkh:eip155:1:0x<maintainer-address>
signature: 0x<signature>
algorithm: EIP-191 personal_sign
```

To verify a release:

1. Check that the address is the maintainer address published outside this repository (see "Maintainer identity").
2. Check that `<git-commit>` is the commit of the tag: `git rev-parse <skill>-v<version>^{commit}`.
3. Check the manifest hash: `sha256sum <skill>/SHA256SUMS` must give `<sha256-of-SHA256SUMS>`.
4. Check the files: in the `<skill>/` folder, `sha256sum -c SHA256SUMS`. The installers do this step automatically.
5. Check the signature: `cast wallet verify --address <address> "<message>" <signature>` (Foundry), or the signature verification page of Etherscan.

Steps 3 and 4 prove integrity. Only step 5, with an address from step 1, proves authorship. An attacker who controls this repository can replace the files, the manifest, the signature and any address written here.

Signing policy:

- One signing address, on a hardware wallet. The recovery phrase is kept offline and is never typed into a computer.
- There is no key rotation and no revocation on request.
- If the recovery phrase is lost, no new release is possible. A new skill under a new name replaces it.
- If the key is compromised, the maintainer publishes a pre-signed annulment statement: `agent-skills|ANNULMENT|0x<address>|All signatures by this address are void.` After that, do not trust any release signed with that address.

## Release procedure (maintainer)

Tools: `tools/release/release.mjs` (manifest and message) and `tools/release/sign/` (local signing page). They use Node.js built-in modules only. The signing page has no external resource and no network access; the wallet does the signature.

1. Set the new version in `metadata.version` of `SKILL.md`. Set the same version in every other place: run `node tools/release/release.mjs check <skill>`, which lists each mismatch.
2. Update the review date in `reference/versions.md` if the version data was reviewed.
3. Run the unit tests of the skill and the behavioral evaluations that the change affects.
4. `node tools/release/release.mjs manifest <skill>`, then commit: `git commit -am "Release <skill> <version>"`.
5. `node tools/release/release.mjs message <skill>` prints the message and the tag name.
6. `node tools/release/sign/serve.mjs`, then open `http://127.0.0.1:8735/` in the browser with MetaMask. Paste the message, connect the signing account, sign. Compare the message on the hardware wallet screen before you confirm. Stop the server.
7. Verify the signature outside the page (step 5 of "Release verification").
8. Create the tag with the result block, and push it:

   ```
   git tag -a <skill>-v<version> -m "<skill> <version>" -m "<result block>"
   git push origin <skill>-v<version>
   ```

9. Create the release archive of the installable folder and attach it to the GitHub release with the result block:

   ```
   git archive --format=zip --prefix=<skill>/ -o <skill>-<version>.zip <skill>-v<version>:<skill>/<skill>
   ```

The annulment statement is signed one time, when the signing address is created, with the same page. Keep it offline, in a different place from the recovery phrase.

## Maintainer identity

Maintainer: Fernando López ([@cainuriel](https://github.com/cainuriel)).

The signing address and its `did:pkh` identifier will be published with the first signed release: in this file, on cainuriel.github.io, and in at least one channel outside GitHub (cainuriel.github.io is hosted by GitHub, so it is not independent of a GitHub account compromise).

## Contributing

Contributions are welcome through pull requests. The maintainer reviews every change. Only the maintainer signs releases. A merged change is not part of a signed release until the next release.

Pull requests that change security defaults (for example the minimum release age or the build approval rules) must explain the reason.

## Security

Report vulnerabilities privately through GitHub security advisories of this repository. Do not open a public issue for a vulnerability.

## License

Apache License 2.0. See [LICENSE](LICENSE).
