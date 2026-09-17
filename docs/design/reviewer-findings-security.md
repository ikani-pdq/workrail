# Reviewer Family: security

**Mission:** adversarial analysis -- what does an attacker control, and what could they do with this change.

## Attacker-controlled inputs in the changed surface

1. **`.mcp.json` launcher (`bash -c "..."`)** -- every value inside the string (`PINNED`, the `npm root -g` invocation, the package path) is a **static literal or a fixed, non-user-controlled subcommand**. Nothing in this string is attacker- or environment-input-controlled (no env var interpolation, no argv passthrough). No injection surface: the classic risk pattern (unsanitized input concatenated into a shell string) does not apply here because there is no input at all, only constants.
2. **CI workflow (`ci.yml`)** -- the new/changed steps (`npm install --ignore-scripts`, `npm audit`, SBOM generation) run against the repo's own `package.json`/`package-lock.json` and `console/`'s, triggered only on this repo's own PR/push events (no `pull_request_target`, no external fork privilege-escalation pattern observed in the diff). `--ignore-scripts` on the console install is a real hardening detail, consistent with the root install's pre-existing flag.
3. **Trust boundary crossing:** none introduced. The launcher runs entirely locally, invoked by the developer's own MCP client against their own machine's global npm install -- there is no remote/attacker-reachable code path here at all. This is a local developer-experience safeguard, not a server-side security boundary.
4. **Secrets/credentials:** `git diff` scanned for token/secret/password/api-key patterns -- only match is the pre-existing `"GITHUB_TOKEN": "ghp_xxxx"` placeholder in `docs/configuration.md`, unchanged by this PR's logic (still an example placeholder, not a real credential).
5. **Supply-chain angle (the actual relevant "attacker" for this PR):** this is precisely what the PR targets -- (a) closing the masked-audit-gate bug so a real high/critical dependency vulnerability can no longer merge silently, and (b) the README/docs change stops developers from being steered toward a same-named-but-different public npm package the author explicitly disclaims as "not security-hardened to this repository's standards." Both are net-positive, verified hardening moves, not new attack surface.

## Verdict
No exploitable injection, privilege-escalation, or credential-handling issue found. This PR's own subject matter (dependency-audit gating, install-source integrity) *is* the security control being strengthened, and both mechanisms were independently verified to work as intended (see `correctness_invariants` and my own `npm audit` / launcher execution above).
