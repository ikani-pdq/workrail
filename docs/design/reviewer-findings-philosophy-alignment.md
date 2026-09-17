# Reviewer Family: philosophy_alignment

Assessed against `AGENTS.md`'s "Coding philosophy" section (the same rubric the author's own `design-review-philosophy.md` used).

## Principle-by-principle

- **Architectural fixes over patches** -- **Satisfied.** Replacing the `tee ... | grep "found 0 vulnerabilities"` string-matching hack with bare `npm audit --audit-level=high` invocations is a genuine root-cause fix: it relies on the tool's own exit-code semantics instead of a fragile text pattern that could silently stop matching on a wording change in a future npm version.
- **Errors are data** -- **Not directly applicable** (no application code / Result types involved), but the CI job's failure signaling is the closest analogue, and it's sound: a failed `npm audit` step fails the job via its own exit code, not via a swallowed/re-interpreted signal.
- **YAGNI with discipline** -- **Satisfied.** No speculative abstraction introduced; each of the 5 described fixes is minimal and proportionate (e.g., no generic "dependency policy engine" was built when a direct audit-gate fix sufficed).
- **Determinism over cleverness** -- **Accepted tension, not a violation.** The `.mcp.json` launcher (nested command substitution + escaped quoting inside one JSON string value) is deterministic in behavior (verified) but dense in construction, trading readability for compactness. The author's own `design-review-philosophy.md` and `final-verification-smells.md` already flag this explicitly and accept it as a JSON-format constraint (no inline comments possible), mitigated externally via `docs/design/pilot-security-remediation-implementation-plan.md`.
- **Document "why", not "what"** -- **Partially in tension.** The launcher's rationale lives only in the design docs, not co-located with the code (JSON can't carry comments). Same tension already named by the author.

## Alternative approaches considered (for the `.mcp.json` guard specifically)

1. **Extract to a versioned shell script** (`scripts/mcp-workrail-guard.sh`, invoked via `"command": "bash", "args": ["scripts/mcp-workrail-guard.sh"]`) reading the pinned version from a single source (e.g., the repo's own `package.json` at build time, or a generated constant). Scores better on *determinism-over-cleverness* (readable, commentable, independently testable) and directly resolves the cross-file duplication finding from `test_docs_rollout`. Scores worse on *YAGNI* only marginally (one new small file). **This is the strongest alternative and was already recommended by the author's own `final-verification-smells.md` Recommended Fixes #1 -- but not implemented in this PR.**
2. **A `postinstall`/`prepare` script that regenerates `.mcp.json`'s pinned value from `package.json` automatically.** Scores well on *architectural fixes over patches* (removes the human-sync step entirely) but adds process complexity (a codegen step touching a git-tracked file) that arguably violates YAGNI for a single-operator/small-team pilot -- reasonable to defer.
3. **Status quo (current PR): hardcode the literal in 10 places, document that it must be manually kept in sync.** Simplest to implement, but scores worst on *determinism over cleverness* in the durability sense (behaves correctly today, but silently invites drift with no enforcement) -- this is the same tension the author already accepted for the single-string case, just at 10x the surface area.

## Verdict
The chosen approach (option 3) is *a* correct implementation, not clearly *the best* one against this repo's own philosophy given the explicit clash with its semantic-release auto-bump policy. Option 1 was already identified and recommended by the author's own review docs and would resolve this cleanly; it is a reasonable, low-risk fast-follow rather than a blocking requirement for this PR.
