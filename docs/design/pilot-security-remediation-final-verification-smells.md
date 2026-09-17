# Final Verification -- Code-Smell Lens

**Scope:** `wr.routine-final-verification`, code-smell/quality lens only, on the pilot
security-remediation diff (`.github/workflows/ci.yml`, `.gitignore`, `.mcp.json`,
`package.json`). Acceptance-criteria correctness is explicitly out of scope for this
lens -- a separate empirical "prover" reviewer covers that. See `implementation_plan.md`
for the full description of what was implemented.

## Readiness Claims and Proof Matrix

This lens does not adjudicate acceptance-criteria proof (deferred to the prover
reviewer by design). No claim -> proof matrix is produced here.

## Validation Evidence Summary

Not assessed in this lens (deferred to the prover reviewer). This review is based on
static reading of `git diff -- .github/workflows/ci.yml .gitignore .mcp.json package.json`
and surrounding file context; no commands were re-run to confirm behavior.

## Severity-Classified Gaps

### Red (blocking)

None found from a pure quality/style perspective.

### Orange (should fix)

1. **Magic-literal version duplication in `.mcp.json`.** The pinned version
   `3.101.1` appears twice inside the single bash `-c` string: once in the
   comparison (`!= "3.101.1"`) and once in the remediation text's tarball filename
   (`ikani.samani-workrail-3.101.1.tgz`). There is no single source of truth --
   the next time the pinned version is bumped, it is easy to update one occurrence
   and miss the other, producing a guard that either false-fails or gives
   inaccurate reinstall instructions.

2. **`Security audit summary` step regressed from dynamic to decorative.** The
   previous implementation derived its `$GITHUB_STEP_SUMMARY` message from the
   actual `npm audit` output (via `grep`), and wrote a message in both the
   pass and fail case. The new step is `if: success()` and always emits the same
   hardcoded string ("No high/critical vulnerabilities found (root and console/).").
   The job still fails correctly when audit finds issues, but there is no longer any
   negative-path line written to the summary -- a reviewer glancing at the Job
   Summary for a failed run sees nothing about the security gate at all, only the
   raw `npm audit` output buried in the failed step's log. This is a loss of
   at-a-glance observability for a security-relevant gate.

### Yellow (accepted tension / follow-up)

1. **Step naming asymmetry.** `Run security audit` (root) vs.
   `Run security audit (console/)` -- the root step doesn't carry a matching
   `(root)` suffix, making the pair harder to scan symmetrically in the Actions UI.

2. **`if: always()` used where `if: ${{ !cancelled() }}` is more idiomatic.**
   Applied to `Generate SBOM` and `Upload SBOM artifact`. `always()` also
   evaluates true on a **cancelled** workflow run, so a cancelled job would still
   attempt to generate and upload an SBOM. `!cancelled()` is the standard idiom
   for "run regardless of prior step failure, but not on cancellation."

3. **No `cache-dependency-path` covering `console/package-lock.json`.** The job's
   `actions/setup-node` step uses `cache: 'npm'` once, before the new
   "Install console dependencies" step. `console/` has its own
   `package-lock.json`; without an explicit `cache-dependency-path` including it,
   the console install likely does not benefit from npm's dependency cache
   (performance-only, not a correctness issue).

4. **Mixed declarative/imperative style within `.mcp.json`.** The existing
   `workrail-dev` entry is a simple declarative `{"type": "http", "url": ...}`
   block; the new `workrail` entry is a dense imperative bash guard. JSON cannot
   carry inline comments, so the guard's rationale isn't documented next to the
   code -- it lives only in `implementation_plan.md`. An extracted `.sh` script
   (invoked via `"command": "bash", "args": ["scripts/mcp-workrail-guard.sh"]`)
   would be more reviewable, independently testable, and could carry a comment
   header explaining intent, without changing behavior.

## Regression / Drift Review

- No drift from the four described changes in `implementation_plan.md` -- the
  diff matches the described scope exactly (CI audit restructuring, dependency
  bumps, `.mcp.json` version guard, `.gitignore` entry).
- One real regression identified: the loss of failure-path messaging in the
  `Security audit summary` step (Orange #2 above). The old code's `if/else`
  branch reported *both* outcomes to the summary; the new code only reports
  the success case.
- No broader pattern of repeated small compromises beyond the two Orange items,
  which are related: both are places where the implementation embeds an
  assumption (a version string staying in sync; audit always succeeding when the
  summary step runs) without anything enforcing it stays true over time.

## Philosophy Alignment

Assessed against AGENTS.md's "Coding philosophy" section.

**Satisfied:**
- *Architectural fixes over patches* -- replacing the `tee` + `grep "found 0
  vulnerabilities"` string-matching hack with two bare `npm audit
  --audit-level=high` invocations relies on the tool's own native exit-code
  semantics instead of a fragile text-pattern special case. This is a genuine
  structural improvement.
- *YAGNI with discipline* -- no speculative abstraction was introduced; each
  change is minimal and proportionate to the stated goal.

**Accepted tensions (Yellow, format-constrained, not blocking):**
- *"Document 'why', not 'what'"* -- JSON cannot hold comments, so the
  `.mcp.json` guard's rationale isn't co-located with the code. Mitigated
  externally by `implementation_plan.md`, but that context doesn't travel with
  the file itself.
- *"Determinism over cleverness"* -- the `.mcp.json` one-liner is deterministic
  in behavior but dense/clever in construction (nested command substitution and
  escaped quoting inside a single JSON string value), trading readability for
  compactness.

No new severity beyond what's already listed under Severity-Classified Gaps;
this section confirms those two Orange/Yellow findings also map to named
philosophy principles rather than being purely ad hoc nitpicks.

## Recommended Fixes

1. Extract the `.mcp.json` `workrail` guard into a small versioned shell script
   (e.g. `scripts/mcp-workrail-guard.sh`) that derives the pinned version from a
   single source (e.g. reads it from `package.json` or a dedicated constant)
   instead of hardcoding `3.101.1` twice inline. This resolves both the
   magic-literal duplication (Orange #1) and the documentability gap
   (Yellow #4) in one move.
2. Restore a failure-path line in `Security audit summary`, or remove the
   step's `if: success()` gate and instead branch on the actual audit outcome
   (e.g. via step outputs), so the Job Summary reflects both pass and fail
   states again.
3. Rename `Run security audit` to `Run security audit (root)` for symmetry.
4. Change `if: always()` to `if: ${{ !cancelled() }}` on the SBOM
   generation/upload steps.
5. Add `cache-dependency-path` (covering both root and `console/` lock files)
   to the `actions/setup-node` step in the `security` job, or accept the
   missed cache as a known minor perf gap.

None of these are blocking; all are safe, low-risk follow-ups.

## Readiness Verdict

**Ready with Accepted Tensions.**

From the code-smell/quality lens alone: no blocking (Red) issues. Two Orange
findings (magic-literal version duplication, decorative-only audit summary)
are real but low-risk maintainability/observability gaps, not defects in the
security-gating logic itself -- they degrade *future* maintainability and
*failure-path* visibility, not current correctness. Four Yellow items are
minor style/idiom nits and a small perf gap, all reasonable to defer. This
verdict is scoped strictly to quality/style; it does not speak to whether
acceptance criteria pass (see the prover reviewer's output for that).


---

## Pass 2 addendum (independent re-verification of the two applied fixes)

- `.mcp.json`: re-parsed the file and re-executed the exact `command`+`args` via `execFileSync` -- match case still reaches `exec workrail` (real server startup observed again); the `PINNED` variable now appears once and is referenced twice, confirmed via direct inspection of the file's `args` array.
- `.github/workflows/ci.yml`: `grep -n "if:"` confirms both SBOM steps now read `if: ${{ !cancelled() }}` (no more `always()`), and the step-naming asymmetry is resolved (`Run security audit (root)` / `Run security audit (console/)`).
- `npm audit --audit-level=high` re-confirmed clean (exit 0) at both root and `console/` -- the style fixes did not touch dependencies and nothing regressed.

No new findings. Both applied fixes hold under independent re-check.
