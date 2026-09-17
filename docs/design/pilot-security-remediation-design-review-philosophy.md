# Design Review: Philosophy Alignment -- Pilot Security Remediation

**Review lens**: coding philosophy alignment (AGENTS.md "Coding philosophy" section).
**Reviewed design**: `design-candidates.md` -- five pilot-readiness security gaps, selected candidates.
**Scope**: CI audit-gate fix, dependency remediation, `.mcp.json` local-install pin, stray-tarball
cleanup, branch protection. Non-goals (per task): canonical-repo decision, npm publish, package rename.

---

## Tradeoff Review

| Item | Accepted tradeoff | Verified safe under realistic conditions? |
|---|---|---|
| CI audit-gate fix (bare `npm audit` gate, `if: success()` pass-only summary) | Gives up a failure-path summary in exchange for zero re-derivation of pass/fail from parsed text | Yes -- stricter than documented Candidate B, and safer: nothing about failure reporting depends on parsing output |
| Dependency remediation (`overrides` for handlebars/lodash/lodash-es; direct bump for vitest) | Pins transitive versions via `overrides` rather than waiting on upstream `semantic-release` bumps | Yes for pilot scope -- confirmed zero `src/` usage; residual risk is release-time only (see Residual Concerns) |
| `.mcp.json` pin (version-suffixed global install path) | Adds real install process weight vs. a bare checkout-relative path, in exchange for a config value that means the same thing on every pilot machine | Yes -- satisfies local-install-only and does not depend on ambient PATH state |
| Stray tarball cleanup | None of substance | Yes -- mechanical, no hidden assumptions |
| Branch protection (require CI Success) | None regarding *whether*; coupling risk on *when/how* | Conditionally -- see sequencing risk below |

Hidden assumptions worth naming: (1) nobody reintroduces a pipe downstream of the audit-gate command
without `pipefail`; (2) the overridden transitive versions stay within what `semantic-release`
internally tolerates; (3) the directory named `<version>` under `~/.workrail/releases/` is trusted to
actually contain that version's build; (4) branch protection's required-check name stays in sync with
the actual CI job name over time.

## Failure Mode Review

- **CI audit-gate fix**: core failure mode (silent pass on vulnerable deps) is fixed -- exit code is
  now real and gating. Uncovered: the separate pass-only summary step isn't stated to be fault-isolated
  (`continue-on-error`); if it throws for an unrelated reason, a genuinely clean audit could still show
  red. Low cost to fix at implementation time.
- **Dependency remediation**: bounded blast radius (transitive-only, zero `src/` usage) is sound. Not
  explicitly covered: re-running the full build/test suite after `audit fix`, since `audit fix` can touch
  more than the named packages. Recommend stating this as a required verification step.
- **`.mcp.json` pin**: closes the one failure mode the user most cares about (pointing at the
  non-canonical hosted package) completely. Not covered: no validation at the config-load boundary that
  the versioned path actually resolves to a working, matching binary -- a typo fails opaquely at
  MCP-connect time. Note for accuracy: this fails at *launch*, before any session exists; it does not
  kill in-flight sessions the way an MCP server runtime crash would (per AGENTS.md's server section).
- **Stray tarball cleanup**: no meaningful failure modes.
- **Branch protection**: closes the confirmed zero-protection gap. Missing: no documented break-glass
  procedure for CI being red for unrelated (flaky/infra) reasons while protection is on.

**Highest-risk failure mode identified (spans items 1, 2, 5)**: a sequencing/deadlock risk. The tree
currently has 3 critical + 10 high audit findings. If the stricter CI gate and branch protection land
*before or separately from* dependency remediation, the first PR to hit the new gate -- possibly the
remediation PR itself -- fails CI Success on pre-existing findings, and with protection now enforced,
cannot be merged to fix that condition. The failure would be loud (not silent -- consistent with
errors-are-data), but it would block all work on `main` until deliberately unwound. **This needs an
explicit landing order in the implementation plan.**

## Runner-Up / Simpler Alternative Review

- **CI fix**: runner-up Candidate C's strength (explicit `PIPESTATUS` capture) solves a problem that
  doesn't exist in selected Candidate B, since B never pipes the gating command -- nothing to borrow. A
  simpler variant (drop the pass-only summary step entirely) would still satisfy the acceptance
  criterion, since the summary is cosmetic, not load-bearing; recommend keeping it but documenting it as
  optional, not part of the safety mechanism.
- **`.mcp.json` pin**: simpler Candidate A (checkout-relative path) was correctly rejected -- it fails
  the actual acceptance criterion (one approved version, identical across pilot machines). **Hybrid
  opportunity**: runner-up Candidate C's version-assertion wrapper is worth layering *on top of*
  selected Candidate B (not replacing it) -- wrap the resolved versioned path in a cheap
  `[ "$(path/bin/workrail --version)" = "<version>" ] || exit 1; exec path/bin/workrail` check. This
  keeps B's structural prevention while adding C's fail-fast, labeled-error detection for the
  boundary-validation gap identified above. Low cost, no conflict with local-install-only or
  determinism. Recommend as optional polish, not a blocker.

## Philosophy Alignment

**Not applicable** (TypeScript/domain-modeling principles; this design is CI YAML / npm / JSON config,
no application types involved): immutability by default, make illegal states unrepresentable, explicit
domain types over primitives, type safety as first line of defense, exhaustiveness everywhere,
dependency injection for boundaries, prefer fakes over mocks, both-sides-of-the-fence execution.

**Clearly satisfied**:
- *Errors are data* -- the entire CI-gate fix exists to restore this; the real `npm audit` exit code
  becomes the single source of truth, decoupled from reporting.
- *Architectural fixes over patches* -- selected Candidate B replaces the broken tee-masks-exit-code
  mechanism outright, rather than patching around it (Candidate A, by contrast, keeps the `tee`
  pipeline and only adds `pipefail` -- closer to a patch).
- *Determinism over cleverness* -- the version-suffixed install path resolves identically on every
  pilot machine, unlike a checkout-relative path or an unpinned PATH-resolved command.
- *YAGNI with discipline* -- CI-D (script extraction for two lines of shell) and MCP-D (Docker, a new
  toolchain) are both rejected with reasoned justification, not reflexive minimalism.
- *Compose with small, pure functions* (analog at CI-step granularity) -- splitting gating and
  reporting into two independent steps mirrors single-responsibility composition even outside code.

**Under tension**:
- *Validate at boundaries, trust inside* -- the `.mcp.json` pin trusts that the install process was
  done correctly rather than validating it at point of use. Real but low-probability gap; a cheap
  mitigation exists (the hybrid above). Acceptable for pilot scope if flagged, not silently accepted.
- *Document "why", not "what"* -- the `overrides` entries and the branch-protection check both encode a
  decision (transitive-only/zero-usage; this specific check is the intended gate) that should carry
  forward as an inline comment / PR description at implementation time, not just live in this review.
- *Errors are data, at the system level* -- each item is individually correct, but composing them
  without a deliberate landing order creates the deadlock risk above. Not a violation of the principle
  per item, but an emergent risk from composition. **This is the most important tension in this
  review.**

## Findings

- **RED**: None. No candidate violates a stated acceptance criterion or invariant outright.
- **ORANGE**:
  1. Sequencing/deadlock risk across items 1, 2, and 5 -- stricter CI gate + branch protection landing
     before dependency remediation could block all merges to `main`, including the fix itself.
- **YELLOW**:
  2. No boundary validation that the `.mcp.json` versioned path resolves to a binary actually reporting
     that version (silent-drift risk on manual tampering).
  3. No stated fault-isolation (`continue-on-error`) on the CI pass-only summary step.
  4. No stated re-run of the full build/test suite after `npm audit fix` + overrides, beyond the
     general AGENTS.md verify phase.
  5. No documented break-glass procedure for branch protection blocking merges during unrelated CI
     flakiness.
  6. Rationale for `overrides` (transitive-only, zero `src/` usage) and for the specific required
     status-check name should be captured as inline comments / PR description, not left implicit.

## Recommended Revisions

1. **Require an explicit landing order**: dependency remediation (item 2) must land at the same time as
   or before the stricter CI gate (item 1) and branch protection (item 5) go live -- ideally as a single
   PR, or in that explicit sequence if split. This directly resolves ORANGE finding 1.
2. Mark the pass-only summary step `continue-on-error: true` (or equivalent) so it can never turn a
   clean audit red for unrelated reasons (YELLOW 3).
3. Add "run `npm run build && npx vitest run`" as an explicit, named verification step for the
   dependency remediation change, not just an implicit reliance on the general verify phase (YELLOW 4).
4. Optional: layer a version-assertion wrapper (runner-up Candidate C's pattern) on top of the selected
   `.mcp.json` versioned-path pin to convert the boundary-validation gap into a labeled, fail-fast error
   (YELLOW 2). Not required for pilot scope, but cheap and philosophy-aligned.
5. Add a one-line comment above the `overrides` block in `package.json` stating the transitive-only /
   zero-usage rationale, and reference the confirmed branch-protection status-check name explicitly in
   the PR description (YELLOW 6).

## Residual Concerns

- `overrides`-pinned transitive versions could diverge from what a future `semantic-release` bump
  expects internally; this would only surface at actual release time (merge to main), since
  semantic-release doesn't run in dry-run on PRs. Low probability given these are dev-toolchain-only
  dependencies; not actionable within this pilot's scope, but worth a note for future maintainers.
- Branch protection's required-check name has no automated drift guard against future CI job renames.
  Out of scope for this task; flagged for future monitoring.
- No break-glass/admin-override procedure is documented for emergency merges while CI is red for
  unrelated reasons. Acceptable for pilot scope given explicit user approval of branch protection as-is,
  but worth deciding on before wider rollout beyond the pilot.


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
