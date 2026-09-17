# Design Review: Robustness — Issue #30 Distribution Model Decision

**Reviewing**: Candidate B — new `docs/adrs/011-distribution-model.md`, cross-referencing ADR-010.

## Edge cases and failure paths checked

1. **Numbering collision.** Confirmed via `ls docs/adrs/` (Phase 0a-2) that ADRs run 001–010 with no gaps; `011` is the correct next number and is currently unused. No collision risk at time of writing, but if another ADR-011 lands first (unlikely for a single-maintainer fork, but possible via a concurrent branch), the PR will surface a merge conflict on the directory listing rather than silently overwriting — acceptable, self-detecting failure mode.

2. **Decision goes stale if the external prerequisite changes.** Issue #8 named "a PDQ-owned GitHub org must exist" as a blocking prerequisite for reviving GitHub Packages. If that org gets created later, the ADR must not read as a permanent, unconditional prohibition — it should explicitly name this as the condition that would warrant reopening the question, not just assert "no" indefinitely. This is a robustness requirement for the drafting step, not just a nice-to-have: an ADR that doesn't name its own revisit conditions tends to calcify past the point it's still correct.

3. **Rogue package outlives this decision.** The ADR cannot claim to resolve or mitigate `iconza98/workrail`'s public npm publish — that's a different repo/account, outside our control regardless of what this ADR decides. The design must state this as an explicit limitation, not as a solved problem, or the document will be factually wrong the day someone checks the npm registry and finds the rogue package still there. (This maps directly to AC-3 from Phase 0-7.)

4. **Content not yet confirmed by the user (process robustness).** The most significant "failure path" identified across this whole design phase (see Phase 2a pre-assessment) is procedural, not textual: drafting and merging ADR-011's content before the user picks between ratify-local-only and revive-issue-8 would produce a technically well-formed but illegitimate decision record. The design's robustness against this failure is external to the document itself — it depends on the workflow actually pausing for confirmation before Phase 2 drafting, which is tracked as `keyRiskToMonitor` from Phase 1c and must not be skipped.

5. **Backlog/index drift.** If `docs/README.md` or `docs/ideas/backlog.md` are edited in a way that doesn't survive a later restructure of those files, the ADR itself remains valid (it's self-contained), so the discoverability mechanism degrading gracefully falls back to "still findable by browsing `docs/adrs/` in number order," not a hard failure.

## Verdict

Robust for a documentation artifact: failure modes are either self-detecting (numbering collision), explicitly named as limitations rather than silently omitted (rogue package, external prerequisite), or tracked as an explicit process gate outside the document itself (user confirmation before drafting). No unhandled edge case identified that would make the resulting ADR silently wrong.
