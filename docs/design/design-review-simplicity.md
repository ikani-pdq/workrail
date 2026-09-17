# Design Review: Simplicity — Issue #30 Distribution Model Decision

**Reviewing**: Candidate B — new `docs/adrs/011-distribution-model.md`, cross-referencing ADR-010, indexed in `docs/README.md`, with a `docs/ideas/backlog.md` closing entry and a consistency pass on `README.md`/`docs/configuration.md`.

## Is this the simplest design that satisfies the acceptance criteria?

- **One new file, not several.** The decision lives in a single ADR. Supporting edits (index entry, backlog entry, doc consistency pass) are one-line-per-file additions to existing documents, not new structures.
- **No new abstraction invented.** This reuses the repo's existing ADR convention (001–010) rather than introducing a new decision-record format, a new directory, or new tooling. Simpler than: a bespoke "distribution-decisions.md" registry, a new `docs/decisions/` directory, or a governance process.
- **Rejected simpler alternative (Candidate A — amend ADR-010 in place) was considered and is genuinely simpler** (zero new files) but fails the primary goal (discoverability/deliberateness signal) — this is the one place where "simplest" and "correct" diverge, and the review confirms that divergence is real, not manufactured to justify a preferred design.
- **No speculative future-proofing.** The ADR states the current decision and names the conditions under which it would be revisited (e.g., a PDQ GitHub org existing would remove issue #8's blocking prerequisite) without building machinery to handle that future case now.

## Verdict

Appropriately simple. The design does not add complexity beyond what's needed to make the decision discoverable and unambiguous. No further simplification identified without also giving up the discoverability goal that is the actual point of this task.
