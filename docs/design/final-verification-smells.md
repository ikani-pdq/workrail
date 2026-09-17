# Final Verification: Smells — Issue #30

## Checked for

1. **Broken relative links.** `docs/README.md``adrs/011-distribution-model.md` → resolves (file exists at `docs/adrs/011-distribution-model.md`). `docs/adrs/011-distribution-model.md``010-release-pipeline.md` and `../../README.md#install` → both resolve (`docs/adrs/010-release-pipeline.md` exists; `docs/adrs/../../README.md` normalizes to `README.md`). `docs/ideas/backlog.md``../adrs/011-distribution-model.md` → `docs/ideas/../adrs/011-distribution-model.md` normalizes to `docs/adrs/011-distribution-model.md`, resolves. `README.md``docs/adrs/011-distribution-model.md` → resolves (README.md is at repo root). No broken links found.
2. **Terminology consistency.** Searched repo-wide for the old vague phrase `"personal upstream fork"` — found and fixed the one remaining stale instance (README.md, caught in the prover pass). All four touched docs now consistently say "a prior personal fork/account of the maintainer's" when referring to `iconza98/workrail`.
3. **Duplication vs. cross-reference.** ADR-011 states the rationale once and is cross-referenced (not re-explained) from README.md, docs/configuration.md, and docs/ideas/backlog.md — each of those sites gets a one-sentence summary plus a link, not a restatement of the full ADR.
4. **Scope creep.** `git diff --name-only` / `git status --porcelain` re-checked: exactly 5 modified/created files match the declared slice, plus the 3 pre-existing design-review files from an earlier phase. No source code, no `package.json`, no CI workflow files touched — matches the issue's explicit non-goal.
5. **Commit-type risk.** No commit has been made yet (pending Ship phase); when it is, `docs:` is the correct type per the derived constraint — flagging here so the Ship step doesn't default to `chore:` or `fix:` out of habit.
6. **Tone/formatting.** No emojis, no em-dashes used in any new/edited doc content (checked by re-reading each diff) — matches the "Things to avoid" rule in AGENTS.md.

## Findings

One smell found and fixed in this pass (the duplicate stale phrase in README.md, already recorded in `final-verification-prover.md`). No other smells identified.
