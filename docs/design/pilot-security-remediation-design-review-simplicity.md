# Design Review: Pilot Security Remediation (Simplicity Lens)

Reviewer focus: is the selected design (`design-candidates.md`) the simplest thing
that could work, and is any part over- or under-engineered relative to the problem
size? Scope: the 5 pilot-readiness security gaps (CI audit-gate bug, dependency
remediation, `.mcp.json` pin, stray-tarball cleanup, branch protection). Only the
CI audit-gate fix and the `.mcp.json` pin have real design tension; the other three
are mechanical and are reviewed only for factual correctness of the stated as-is
state.

Grounding performed: read `.github/workflows/ci.yml`, `.mcp.json`, `.gitignore`,
`package.json`, `README.md`; confirmed GitHub Actions' default (unspecified) `run:`
shell semantics and Claude Code's MCP `command`-field spawn behavior against
current documentation.

## Tradeoff Review

**CI-B (npm audit's own exit code gates; a separate best-effort step writes the
summary) -- selected.**
- Verified the premise is real: GitHub Actions' default (no `shell:` key) `run:`
  shell is `bash -e {0}` **without** `pipefail` -- only explicit `shell: bash` adds
  `-eo pipefail`. So today's `npm audit | tee audit-results.txt` genuinely masks
  the real exit code, and the if/else only ever prints text. Confirmed bug, not a
  hypothetical.
- Verified the fix mechanism is sound and needs no pipefail at all: a bare
  `npm audit --audit-level=high` as the sole command in the step fails the step
  under plain `-e`, identically to how `npm run typecheck` gates today.
- Accepted cost ("audit runs twice") is low-risk: both invocations read the same
  on-disk lockfile/node_modules within one job, nothing mutates dependencies
  between them. Real exposure is only doubled surface area for a transient
  npm-registry flake, not a correctness gap.
- The summary step reuses an existing pattern already in this file
  (`validate-workflows`'s `Summary` step, gated `if: success()`) -- no new
  convention introduced.

**MCP-B (version-suffixed global install path via `npm install -g <tarball>
--prefix ~/.workrail/releases/<version>`) -- selected.**
- Verified current `.mcp.json` state: `"workrail": { "command": "workrail" }`,
  confirmed unpinned/PATH-resolved.
- Verified README.md:211-220 already documents the `npm pack` + `npm install -g
  ./tarball` flow -- MCP-B adds only a `--prefix <versioned-dir>` flag, no new
  tooling. This is a minimal, faithful extension, not new process.
- The extra process weight (one `--prefix` flag, a versioned directory) is only
  justified if the pilot is genuinely multi-participant, each independently
  installing an agreed version. See Residual Concerns -- this fact was not
  independently confirmed in this review.

**Rejected candidates (CI-D script extraction, MCP-D Docker).** Both correctly
rejected on YAGNI / no-scope-creep grounds; no objection.

## Failure Mode Review

1. **[Highest severity] Literal `~` in `.mcp.json`.** `design-candidates.md`'s own
   MCP-B code sample writes `"command": "~/.workrail/releases/<version>/bin/workrail"`.
   Confirmed via current documentation: Claude Code spawns the `command` value
   directly as a child process (no shell), and `~` does **not** expand in this
   context -- the documented failure is `failed to spawn server: ENOENT`. If this
   literal example is used instead of a fully-expanded absolute path (e.g.
   `/Users/ikanisamani/.workrail/releases/3.103.1/bin/workrail`), the fix silently
   breaks the MCP server for the person running the pilot. **This is a defect in
   the design's illustrative example, not just an implementation risk** -- flag it
   explicitly in the implementation step.
2. **No regression guard for the tee-masking bug pattern (CI-B).** The design
   deliberately does not extract gate logic into a tested script (YAGNI). Nothing
   stops a future "simplification" from re-merging the summary write and the gate
   into one piped invocation, silently reintroducing the exact bug being fixed
   here, with no automated backstop -- only code review would catch it.
3. **Silent stale/mistargeted version install (MCP-B).** If the install step
   targets the wrong version or is re-run incompletely, the resulting path either
   doesn't exist (loud ENOENT, self-detecting) or points at a stale prior install
   (silent wrong-version). No explicit "verify installed version" step in the
   design.
4. Branch-protection required-check-name coupling is already self-mitigated by an
   explicit comment in `ci.yml` at the `ci-success` job. No gap.
5. Dependency-remediation blast radius is bounded: confirmed zero references to
   handlebars/lodash/lodash-es under `src/`, so an `overrides` entry cannot change
   first-party runtime behavior; residual risk is caught by the standard
   build/test verification phase.

## Runner-Up / Simpler Alternative Review

- **CI fix:** Runner-up C (`PIPESTATUS` capture) offers nothing worth pulling into
  B -- it exists only to preserve a single-invocation pattern B already abandoned.
  Simpler candidate A (add `set -o pipefail`) is correctly disqualified: it still
  *decides* pass/fail by grepping summary text rather than trusting the exit code,
  violating the repo's own exit-code-gating convention. B is simultaneously the
  simplest design and the only one that fully satisfies the convention -- no
  simpler design also satisfies the constraint.
- **`.mcp.json` fix:** Runner-up C (version-assertion wrapper) is not worth
  hybridizing in -- B already structurally prevents version ambiguity, so layering
  C's runtime assertion on top guards against a failure mode B already eliminates
  by construction (over-engineering direction). Simpler candidate A (bare absolute
  path into this checkout's `dist/`) remains a live option if the pilot turns out
  to be single-operator rather than multi-participant -- see Residual Concerns.

## Philosophy Alignment

**Satisfied clearly:** errors-are-data (CI-B restores the real exit code as source
of truth), architectural-fix-over-patch (removes the pipe rather than working
around it), determinism-over-cleverness (exit-code gating instead of text
matching; version-suffixed path instead of PATH-resolved ambiguity),
illegal-states-unrepresentable (MCP-B's versioned path makes "two machines
pinned to different code" structurally impossible), YAGNI-with-discipline
(CI-D/MCP-D correctly rejected), document-why-not-what (existing design
rationale reads as intent, not mechanics). Branch protection operationalizes the
repo's existing "never push directly to main" rule as an enforced gate rather
than a convention.

**Under tension (both acceptable, with watch conditions):**
- Testability/composability vs. YAGNI (CI-B): extracting gate logic would be more
  testable, but for a genuinely 2-line, branchless check, YAGNI correctly wins.
  **Revisit if** the gate logic ever grows past a single command (CVE allowlists,
  multiple audit levels, per-package exceptions).
- YAGNI vs. determinism-over-cleverness (MCP-B): the extra install-process weight
  is justified only if multiple participants need to converge on one approved
  version. Not risky, but unresolved -- see Residual Concerns.

**No risky (unacceptable) tensions identified.**

## Findings

- **RED -- Literal `~` in the `.mcp.json` design example (MCP-B).** Will silently
  break the MCP server on launch if implemented as literally shown. Must be
  corrected to a fully-expanded absolute path before/while implementing.
- **YELLOW -- No regression guard for the CI audit-gate bug pattern.** Accepted
  YAGNI tradeoff, but a one-line explanatory comment in `ci.yml` (why the gate is
  a bare command, not a pipe) is cheap insurance against silent reintroduction.
- **YELLOW -- Multi-participant vs. single-operator pilot fact not confirmed.**
  This single fact determines whether MCP-B's extra process weight over MCP-A is
  justified. Recommend confirming before implementation rather than after.
- **YELLOW -- README's documented install flow will drift from the actual pilot
  flow** unless updated to show the `--prefix <version>` variant alongside the
  existing `npm pack` / `npm install -g` instructions.
- No RED or ORANGE findings on the CI-B design itself -- it is correctly the
  simplest design that fully satisfies the stated convention constraint.

## Recommended Revisions

1. When implementing MCP-B, write the fully-expanded absolute path in `.mcp.json`
   (e.g. `/Users/ikanisamani/.workrail/releases/3.103.1/bin/workrail`) -- never a
   literal `~`. Verify by confirming the MCP server actually launches after the
   change (not just that the path exists on disk).
2. Add a short comment above the `Run security audit` step in `ci.yml` explaining
   why it must remain a bare, unpiped command (references the bug this fixes).
3. Update `README.md`'s existing `npm pack` / `npm install -g` install
   instructions to include the `--prefix ~/.workrail/releases/<version>` variant
   used for the pilot pin, so the documented flow matches the actual one.
4. Before implementing MCP-B as designed, confirm whether this pilot is genuinely
   multi-participant. If it is confirmed single-operator, MCP-A (bare absolute
   `dist/` path) satisfies the same determinism goal with strictly less process
   and would be the simpler-and-sufficient choice.

## Residual Concerns

- The multi-participant assumption underlying MCP-B's extra process weight was
  not independently verifiable from the repository alone (it's a fact about the
  pilot's rollout, not about the code) -- flagged three times across this review
  (Tradeoffs, Runner-Up Comparison, Philosophy) because it is the one fact that
  would change the recommended `.mcp.json` design if false.
- This review did not re-verify the exact npm audit vulnerability counts (3
  critical + 10 high) claimed in the task context; dependency remediation was
  reviewed only for whether the `overrides` approach is safe given zero `src/`
  usage of the affected transitive packages, which was confirmed.


---

## Pass 2 addendum (targeted re-review of the revised `.mcp.json` design)

Verified end-to-end via true argv passing (Node's `execFileSync("bash", ["-c", script])`, matching exactly how an MCP client spawns `command`+`args` -- no intermediate shell re-tokenization), not just the standalone inner fragment:

```
v=$(node -p "require('$(npm root -g)/@ikani.samani/workrail/package.json').version" 2>/dev/null); if [ "$v" != "3.101.1" ]; then echo "workrail: pinned version 3.101.1 not found (installed: ${v:-none}). Reinstall: npm pack && npm install -g ./ikani.samani-workrail-3.101.1.tgz" >&2; exit 1; fi; exec workrail
```

- Match case (installed version == pinned version): exits 0, reaches `exec workrail`.
- Mismatch case (tested with a deliberately wrong pinned value): exits 1 with a clear, actionable stderr message; never reaches `exec`.
- PATH resolution (`node`, `npm`, `workrail` all resolved correctly inside the spawned `bash -c` process) confirmed on this machine. Residual, accepted risk: not verified on a pilot participant machine with a different Node version manager or shell -- flagged as a known unknown for the rollout, not a design defect; the existing bare `command: workrail` config already carries the identical unverified-on-other-machines risk today, so this is not a regression.

No new findings beyond what pass 1 already surfaced and the synthesis step already resolved. Design confirmed stable at 2 passes (loop cap reached).
