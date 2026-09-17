# Design Review: Philosophy Alignment — Issue #30 Distribution Model Decision

**Reviewing**: Candidate B against `AGENTS.md`'s "Coding philosophy" section (most of which targets source code; only the subset applicable to a documentation deliverable is scored here — the rest are marked not-applicable rather than silently skipped).

| Principle | Applicable? | Verdict |
|---|---|---|
| Document "why", not "what" | Yes | **Aligned.** The ADR is required to carry the evidence (provenance mismatch, ADR-010's prior note) and reasoning, not just the outcome — this is the explicit constraint carried from Phase 0c. |
| Architectural fixes over patches | Yes | **Aligned.** A dedicated ADR at the root decision point, not a scattered wording patch across README/config — this is exactly why Candidate B beat Candidate A. |
| Determinism over cleverness | Marginal | **Aligned by construction.** A written decision record is inherently a fixed, non-hidden-state artifact; there's no "clever" alternative that applies here. |
| Errors are data / Result types | No | Not applicable — no code, no error paths. |
| Make illegal states unrepresentable | No | Not applicable — no data types introduced (confirmed in Phase 0-6's type-design gate). |
| Immutability by default | No | Not applicable — no mutable state involved. |
| YAGNI with discipline | Yes | **Aligned.** No speculative distribution-tooling scaffolding is being built; the ADR documents a decision, not a system. |
| Prefer explicit domain types over primitives | No | Not applicable. |
| Compose with small, pure functions | No | Not applicable. |

## AGENTS.md process principles (beyond the code-philosophy list) also checked

- **"The user drives decisions... do not make architectural decisions unilaterally."** This is the constraint most load-bearing for this specific task. The design explicitly separates the *format* decision (which I selected: new ADR-011) from the *content* decision (ratify vs. revive #8), deferring the latter to the user. This was the central finding of Phase 1c's challenge-and-select step and is carried forward as the top risk to monitor into drafting.
- **Docs placement convention** (`docs/adrs/` for locked decisions, `docs/design/` for working papers like this review itself). Respected: this review document belongs in `docs/design/` per that convention, and the actual decision belongs in `docs/adrs/`, not the reverse.
- **No `.md` deletion without authorization / no destructive edits.** Respected: ADR-010 is extended via cross-reference, not deleted or rewritten.

## Verdict

Aligned on every applicable principle. Several code-focused principles (immutability, Result types, pure functions, explicit domain types) are correctly marked not-applicable for a documentation-only deliverable rather than forced to fit or silently dropped. The one principle carrying real weight for this task — decision ownership resting with the user — is explicitly honored in the design rather than assumed away.
