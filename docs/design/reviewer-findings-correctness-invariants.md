# Reviewer Family: correctness_invariants

**Scope:** PR #27 (`fix/pdq/pilot-security-remediation`). No application code changed (CI/config/docs/lockfile only); `callerEnumerationResults` is empty by design (confidence High).

## Checklist findings

1. **Branch/edge-case coverage in `ci.yml`'s security job:** both audit steps (`Run security audit (root)`, `Run security audit (console/)`) run bare `npm audit --audit-level=high` with no `tee`/pipe -- each independently propagates its own exit code to the job. Confirmed via direct read plus the job's live green run (`gh pr checks 27`). No unhandled branch found in the gating logic itself.
2. **Caller contract impact:** N/A -- zero functions/symbols changed.
3. **Invariant the launcher must uphold** ("refuse to start on any verification failure, never fail open"): adversarially tested beyond the author's own two cases (match / deliberately-wrong-pinned-value). Tested a **third case** not covered in the author's `docs/design/*-final-verification-prover.md`: `node -p` itself erroring out entirely (target `require()` path missing), which is what happens if `npm root -g` can't be resolved or the global package is absent/corrupted. Result: `v` resolves to empty string, `[ "$v" != "$PINNED" ]` is true, script prints the reinstall message and `exit 1` -- **never reaches `exec workrail`**. Fails closed on this path too. (See test run in this review's transcript; exit code confirmed 1.)
4. **Null/empty cases:** the `${v:-none}` parameter expansion in the error message correctly handles `v` being empty without printing a raw blank.
5. **Existing tests:** no test files touched by this PR; `npx vitest run` result cited in the PR body (22 pre-existing failures, confirmed pre-existing by the author via `git stash`) is consistent with what the author's own `final-verification-prover.md` independently reproduced and root-caused (unquoted path-with-space in `tests/unit/cli-validate.test.ts` / `cli-version.test.ts`, unrelated to this diff).

## Verdict
No correctness/invariant violations found. One edge case (node -p hard failure) was untested by the author but I verified it independently and it fails closed correctly -- **no finding, closes a gap in their own evidence rather than opening a new one.**
