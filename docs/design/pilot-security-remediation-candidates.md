# Design Candidates -- Pilot Security Remediation

Scope note: of the five in-scope items (CI audit-gate fix, dependency remediation,
`.mcp.json` pin, stray-tarball cleanup, branch protection), only two have real design
tension worth generating candidates for: the **CI audit-gate fix** and the
**`.mcp.json` pin**. Dependency remediation, tarball cleanup, and branch protection
are mechanical (single obviously-correct action each) -- generating "candidates" for
those would be decorative, so they're executed directly in the implementation phase.

## Constraint orientation (from Phase 0c `derivedConstraints`)

- **[TEAM_RULE] shell safety**: rules out any redesign that drops bash-specific
  safety (`pipefail`, arrays) in favor of `sh`-portable-but-weaker constructs.
- **[CONVENTION] pass/fail via job exit code, not summary-text parsing**: rules out
  any candidate that keeps grepping `GITHUB_STEP_SUMMARY`/a results file to decide
  pass/fail.
- **[TEAM_RULE] no `git add -A`**: governs the commit step, not candidate design
  itself.
- **[PHILOSOPHY] CI failure signaling / errors-are-data**: rules out any candidate
  where failure is only *visible*, not *enforced*.
- **[PHILOSOPHY] MCP config determinism**: rules out any `.mcp.json` candidate that
  still depends on ambient PATH state to determine which version runs.
- **[TEAM_RULE] local-install-only for `.mcp.json`**: rules out anything that adds
  an `npx`/registry reference, no exceptions.
- **[CONVENTION] dependency changes via lockfile tooling**: governs dependency
  remediation, not these two candidates.

## Tensions

1. **Auditability vs. gate reliability (CI fix)**: the current step tries to do two
   jobs at once -- produce a human-readable summary *and* gate the merge -- by
   piping the same command through `tee`. Any redesign has to decide whether those
   two concerns share one invocation (denser, but coupled) or split into two
   invocations (clearer, but runs `npm audit` twice).
2. **Simplicity vs. portability (`.mcp.json` fix)**: pinning to *this exact checked-
   out working tree* (an absolute path into this repo's `dist/`) is trivial to
   write, but only pins "whatever this one machine's checkout currently contains."
   Pinning to *a specific approved published-locally version* requires a small
   amount of install process (a version-suffixed install location) but produces a
   config that means the same thing on every pilot participant's machine.
3. **Process weight vs. actual enforcement (`.mcp.json` fix)**: a version-assertion
   wrapper is nearly free to add but only catches a *version mismatch after the
   fact* (at launch); a version-suffixed install path prevents the ambiguity from
   existing at all. Both are "local-install-only" compliant; they differ in whether
   they prevent or merely detect drift.
4. **YAGNI vs. reusability (CI fix)**: the gate logic is two lines. A tiny amount of
   complexity doesn't justify extracting it into a maintained script file, even
   though that would technically be "more testable."

## Candidates -- CI audit-gate fix

**A. Simplest change: add `set -o pipefail`, replace the else-branch echo with `exit 1`.**
- Resolves tension 1 by keeping the single-invocation `tee` pattern; accepts the
  coupling between summary-writing and gating.
- Satisfies: [TEAM_RULE] shell safety (pipefail is a bash feature, step already runs
  under bash -e), [PHILOSOPHY] errors-are-data (once pipefail is set, the exit code
  is real and now actually checked).
- Conflicts with: [CONVENTION] pass/fail-via-exit-code is satisfied only indirectly
  -- the step still *decides* failure by re-deriving it from grepping the summary
  file's text rather than trusting `$?` directly. Workable, but not the cleanest
  match to how every other job in this file signals failure.
- Smallest diff of all candidates.

**B. Faithful extension of existing convention: let the audit command's own exit
code directly fail the step; write the summary from a separate, non-gating
invocation.**
```bash
npm audit --audit-level=high
# ^ if this fails, the step fails immediately (bash -e), exactly like
#   `npm run typecheck` or `tsc` failing in the Type Check job.
```
followed by a second, best-effort step (`continue-on-error: true` or a trailing
`|| true`) that writes the human-readable summary independent of gating.
- Resolves tension 1 by splitting the two concerns: one line gates, a separate line
  reports. Resolves tension 4 implicitly -- no extraction needed, just two plain
  commands.
- Satisfies: [CONVENTION] pass/fail-via-exit-code directly and unambiguously (this
  *is* how Type Check/Build Artifact/Lockfile Stable already work in this file --
  most faithful extension of the existing pattern), [PHILOSOPHY] errors-are-data,
  [TEAM_RULE] shell safety.
- No constraint conflicts identified.
- Runs `npm audit` logic twice in the worst case (once to gate, once to summarize)
  -- a minor cost, not a correctness issue, since it's read-only and fast.

**C. Explicit exit-code capture via a variable, single invocation.**
```bash
set +e
npm audit --audit-level=high 2>&1 | tee audit-results.txt
AUDIT_EXIT=${PIPESTATUS[0]}
set -e
...
if [ "$AUDIT_EXIT" -ne 0 ]; then exit 1; fi
```
- Resolves tension 1 by keeping one invocation but capturing the real exit code
  explicitly via `PIPESTATUS` rather than relying on ambient `pipefail` (which, if
  ever combined with a later pipeline in the same step block, could produce
  surprising failures on unrelated lines).
- Satisfies all the same constraints as A/B.
- More verbose than A, more coupled than B; a reasonable middle ground, not clearly
  better than B.

**D. Rejected: extract gate logic into `scripts/ci-audit-gate.sh`.**
- Would improve testability/reusability, but two lines of shell do not justify a
  new maintained script file and its own test coverage -- conflicts with
  [PHILOSOPHY] YAGNI-with-discipline. Rejected, not merely deprioritized.

**Ranking**: B > C > A > D. B is recommended: it's the most faithful extension of
this file's existing exit-code-based gating convention, cleanly separates gating
from reporting, and has no constraint conflicts.

## Candidates -- `.mcp.json` local-install pin

**A. Simplest change: absolute path into this checkout's own `dist/`.**
```json
"workrail": { "command": "node", "args": ["/Users/ikanisamani/claude projects/workrail/dist/mcp-server.js"] }
```
- Resolves tension 2 by accepting "pins to this machine's current checkout" instead
  of "pins to an approved version" -- fully deterministic *for this one checkout*,
  but the pin travels with whatever commit happens to be checked out locally, not
  with an explicitly approved release.
- Satisfies: [TEAM_RULE] local-install-only, [PHILOSOPHY] MCP config determinism
  (for this machine).
- Conflicts with: the pilot's actual intent (pin an *approved* version everyone
  runs) is weaker here -- two pilot participants on different commits would each be
  "correctly pinned" to two different things. Workable for a single-developer
  setup, not for a multi-participant pilot rollout.

**B. Faithful extension of the existing local-install convention: version-suffixed
global install path.**
```
npm pack
npm install -g ./ikani.samani-workrail-<version>.tgz --prefix ~/.workrail/releases/<version>
```
```json
"workrail": { "command": "~/.workrail/releases/<version>/bin/workrail" }
```
- Resolves tension 2 by keeping the documented `npm pack` + `npm install -g` flow
  (no new tooling, no Docker, no registry) but parameterizing the install location
  by version, so the config *itself* states which approved version runs, and two
  machines that both installed the same approved tarball get an identical,
  verifiable config value.
- Resolves tension 3 by preventing drift structurally (wrong version simply isn't
  at that path) rather than detecting it after the fact.
- Satisfies: [TEAM_RULE] local-install-only, [PHILOSOPHY] MCP config determinism,
  and is the most faithful extension of the README's existing `npm pack`/`npm
  install -g` instructions (only the `--prefix` flag and path are new).
- No constraint conflicts identified.

**C. Version-assertion wrapper around the existing bare command.**
```json
"workrail": { "command": "bash", "args": ["-c", "[ \"$(workrail --version)\" = \"<version>\" ] || { echo 'workrail version mismatch' >&2; exit 1; }; exec workrail"] }
```
- Resolves tension 3 the opposite way from B: cheap to add, but only *detects* a
  mismatch at launch rather than *preventing* the ambiguity -- if two different
  version installs are both reachable via PATH, this still can't guarantee which
  one `workrail --version` reports first is the one actually being pinned against
  (it's the same binary either way here, but doesn't fix the underlying
  PATH-ordering hazard).
- Satisfies: [TEAM_RULE] local-install-only, [PHILOSOPHY] MCP config determinism
  (as a guard rather than a structural guarantee).
- No hard conflicts, but weaker than B for the same problem.

**D. Rejected: local Docker image, referenced by tag.**
```json
"workrail": { "command": "docker", "args": ["run", "--rm", "-i", "workrail:<version>"] }
```
- Already a documented pattern in `docs/docker.md`, and would give strong
  pinning + isolation. Rejected for this task: introduces a new required toolchain
  (Docker) beyond what the user asked for ("local install," matching the existing
  non-Docker convention already in use) -- scope creep relative to the five-item
  task, not a disqualifying constraint violation. Worth flagging as a stronger
  future option if the user ever wants it.

**Ranking**: B > C > A > D. B is recommended: most faithful extension of the
existing documented local-install convention, fully local, no registry, and
structurally prevents version ambiguity rather than merely detecting it.

## Constraint satisfaction matrix

| Candidate | TEAM_RULE (local-only / shell-safety) | CONVENTION (exit-code / lockfile) | PHILOSOPHY (determinism / errors-are-data) | Verdict |
|---|---|---|---|---|
| CI-A | Y | Partial (indirect) | Y | Acceptable, not best |
| CI-B | Y | Y (direct) | Y | **Recommended** |
| CI-C | Y | Y (direct) | Y | Acceptable, more verbose |
| CI-D | Y | Y | Y | Rejected (YAGNI) |
| MCP-A | Y | n/a | Partial (per-machine only) | Acceptable, weak for multi-participant pilot |
| MCP-B | Y | n/a | Y | **Recommended** |
| MCP-C | Y | n/a | Y (detective, not preventive) | Acceptable fallback |
| MCP-D | Violates "local install only" intent (new toolchain) | n/a | Y | Rejected (scope creep) |

## Recommendation

- CI audit-gate fix: **Candidate B** (let `npm audit`'s own exit code fail the
  step directly; write the human-readable summary from a separate, non-gating
  step).
- `.mcp.json` pin: **Candidate B** (version-suffixed local global-install path via
  `npm install -g <tarball> --prefix ~/.workrail/releases/<version>`, referenced by
  its absolute versioned path in `.mcp.json`).
