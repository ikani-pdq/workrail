# Design Review: Robustness -- Pilot Security Remediation

**Review lens**: robustness -- failure modes, edge cases, assumption breakage (transient errors,
partial failures, concurrent/repeated runs, environment differences).
**Reviewed design**: `design-candidates.md` -- five pilot-readiness security gaps, selected candidates.
**Scope**: CI audit-gate fix, dependency remediation, `.mcp.json` local-install pin, stray-tarball
cleanup, branch protection. Non-goals (per task): canonical-repo decision, npm publish, package rename.
**Cross-referenced**: `docs/design/design-review-philosophy.md` (an earlier philosophy-lens review of
the same design) -- findings below are additive to it, not a duplicate; overlaps are called out
explicitly.

Method: read the design doc, then verified claims against the live repo -- `.github/workflows/ci.yml`,
`.mcp.json`, `package.json`, `npm audit --json` output -- and empirically tested the
`npm install -g <tarball> --prefix <dir>` mechanic and the `workrail --version`/`-v`/`version` CLI
surface in an isolated scratch directory.

## Tradeoff Review

| Item | Accepted tradeoff | Holds under realistic conditions? |
|---|---|---|
| CI audit-gate fix (bare `npm audit` gate; separate summary step) | Accepts running audit logic twice for gate/report separation | Partially -- mechanically sound, but the "runs it twice" cost is avoidable (see Runner-Up section), and the gate's failure path is completely untested in this repo's history |
| `.mcp.json` pin (version-suffixed global install path) | Accepts real install-process weight for a config value that's supposed to mean the same thing on every pilot machine | **No** -- empirically confirmed the install mechanic works, but the config value it produces is a home-directory-embedded absolute path baked into a git-tracked, shared file; it does not actually mean the same (working) thing across participants with different usernames unless the MCP client expands `~`/`$HOME`, which is unverified |
| Dependency remediation (`overrides` + vitest bump) | Pins transitive versions via `overrides`, accepting risk to the `semantic-release` toolchain | Partially mitigated -- the existing `semantic-release-dry-run` CI job exercises config/version resolution, but runs with `--verify-conditions false`, so the actual publish-time plugin chain (git commit, GitHub release, changelog write) is not exercised pre-merge |
| Stray tarball cleanup | None of substance | Yes |
| Branch protection (require CI Success) | None regarding *whether*; timing risk on *when* | Conditionally -- see Failure Mode Review |

## Failure Mode Review

1. **Sequencing deadlock (items 1 + 5 before item 2).** Tree currently has 3 critical + 10 high
   findings. If the fixed gate and branch protection land before dependency remediation, the next PR
   -- possibly the fix itself -- fails CI Success on pre-existing findings and, with protection now
   enforced for the first time in this repo's history, cannot be merged. No break-glass procedure is
   documented anywhere. (Corroborates the philosophy review's top finding; robustness lens adds: this
   is the first time this repo has ever had a required-status-check deadlock, so nobody has exercised
   the recovery path.)
2. **`.mcp.json` cross-machine path breakage.** Not previously identified. `.mcp.json` is git-tracked
   (confirmed via `git log`). A committed absolute, home-directory-embedded path will not resolve on a
   second participant's machine unless the MCP client performs `~`/`$HOME` expansion at spawn time --
   unverified assumption, directly undermines the "same config, same result for every participant"
   goal that justified choosing this design over the simpler alternative.
3. **Audit gate cannot distinguish a real finding from a transient registry error.** `npm audit` calls
   out to the registry; a network blip now hard-fails the step exactly like a real vulnerability would,
   and (once branch protection is live) blocks every PR merge indistinguishably. No retry/backoff or
   documented triage guidance.
4. **SBOM generation silently skipped on first real gate failure.** `Generate SBOM` / `Upload SBOM
   artifact` have no `if:` override in the same job, so GH Actions' default `if: success()` means they
   won't run once the gate step fails for real. Not a bug, but an undocumented behavior change (today
   the job always "succeeds" so SBOM always ships) -- no explicit decision recorded on whether a
   blocked build should still produce an SBOM.
5. **Dependency-override risk only partially covered pre-merge** (see Tradeoff Review) -- first full
   proof is the first real merge-triggered release after the change, which is not cleanly reversible if
   it partially succeeds.

**Most dangerous by blast radius**: #1 (sequencing deadlock) -- can block all work on `main`, including
its own fix, with zero documented recovery.
**Most dangerous by likelihood of silent occurrence**: #2 (`.mcp.json` path) -- uncaught by the prior
review, would quietly break the pilot for most participants while the design doc treats it as solved.

## Runner-Up / Simpler Alternative Review

- **CI fix**: nothing worth borrowing from runner-up C (`PIPESTATUS` capture) -- moot once the gate
  step drops the pipe entirely, which it does. Found a genuine simplification of the *selected* design:
  the `if: success()` summary step does not need to re-invoke `npm audit` at all -- if it's reached,
  "no high/critical vulnerabilities" is already an established fact, so it can echo a static line. This
  removes tension 4's "runs audit twice" cost entirely (not just accepts it) and removes a hidden
  fragility: matching against `npm audit`'s human-readable text is not a stable interface (its output
  format has changed across npm major versions before).
- **MCP fix**: directly tested the premise behind runner-up C and the philosophy review's recommended
  hybrid ("layer C's version-assertion wrapper on top of B"). `workrail --version`, `-v`, and `version`
  were all invoked against the real installed binary -- **none print a version and exit**; each silently
  boots the full stdio MCP server instead (its own startup banner even logs `version=unknown`). The
  wrapper snippet in the design doc, and the philosophy review's recommended hybrid built on the same
  assumption, are both non-functional as written. Correction: a version check must read
  `lib/node_modules/@ikani.samani/workrail/package.json`'s `"version"` field directly (verified present
  and correct: `3.101.1`), not shell out to a CLI flag.
- Also found the simpler alternative (A: checkout-relative path) and the selected design (B) share the
  same unaddressed weakness once `.mcp.json` is git-tracked and shared: both embed an absolute,
  machine/user-specific path in the same committed file. B's real improvement over A is narrower than
  advertised -- it states which *approved version* is intended, but does not by itself guarantee the
  config resolves to a working binary for every participant. No hybrid of B+C closes this; it needs
  either a per-participant local-override convention or confirmed `$HOME` expansion in the MCP loader.

## Philosophy Alignment

A dedicated philosophy-lens review already exists (`docs/design/design-review-philosophy.md`) covering
the full principle set. Robustness-relevant additions only:

- *Errors are data* -- satisfied and strengthened by the Runner-Up section's static-echo
  simplification (removes a hidden dependency on unstable `npm audit` text).
- *Validate at boundaries, trust inside* -- under tension more severely than previously assessed: the
  philosophy review treated this as "a typo fails opaquely" (low-probability, narrow); robustness
  testing shows the actual gap is structural -- a shared file cannot validate a per-machine boundary
  without either client-side expansion support or a per-participant convention, neither of which is
  designed for.
- *YAGNI with discipline* -- the static-echo simplification is a case where the more robust option is
  also the simpler one, not a tradeoff between them.

## Findings

- **RED**: None -- no candidate violates a stated acceptance criterion or invariant outright.
- **ORANGE**:
  1. Sequencing/deadlock risk across items 1, 2, and 5 (Failure Mode 1) -- corroborates philosophy
     review; needs an explicit landing order before any of these three merge.
  2. `.mcp.json` cross-machine path breakage (Failure Mode 2) -- newly identified; risks silently
     defeating the pilot's multi-participant goal. Recommend escalating to blocking, not residual.
- **YELLOW**:
  3. Audit gate cannot distinguish real findings from transient registry errors (Failure Mode 3) -- no
     retry/backoff or triage documentation.
  4. SBOM generation/upload silently skipped on first real gate failure (Failure Mode 4) -- undocumented
     behavior change, no explicit decision recorded.
  5. `semantic-release-dry-run` only partially covers the dependency-override risk (publish-time plugin
     chain untested pre-merge).
  6. Runner-up C's version-assertion wrapper (and the philosophy review's recommended hybrid using it)
     is non-functional as specified -- `workrail --version`/`-v`/`version` do not print a version and
     exit.

## Recommended Revisions

1. Require an explicit landing order for items 1, 2, and 5 (dependency remediation merges first, or in
   the same PR) -- resolves ORANGE 1.
2. Before rollout, verify whether Claude Code's MCP client expands `~`/`$HOME` in a project `.mcp.json`
   `command` field; if not, document a per-participant local-path convention instead of committing one
   absolute path for everyone -- resolves ORANGE 2.
3. Implement the CI summary step as a static echo (no second `npm audit` invocation) -- resolves part of
   YELLOW findings around fragility and simplifies tension 4 away entirely.
4. Add a one-line runbook note: a red Security Audit check requires a human to distinguish a real
   finding from a registry/network error before treating it as a merge-blocker (YELLOW 3).
5. Explicitly decide and document whether SBOM generation should still run (`if: always()`) when the
   audit gate fails (YELLOW 4).
6. If a version-assertion wrapper is still desired for `.mcp.json` (per the philosophy review's
   suggestion), implement it against the installed `package.json`'s version field, not a CLI flag
   (YELLOW 6).

## Residual Concerns

- Even after Recommended Revision 2, `.mcp.json`'s single-file-per-repo model may be a poor fit for a
  multi-participant, differently-homed-directory pilot in general; worth a small design note for
  whoever owns pilot onboarding, independent of this task's scope.
- No break-glass/admin-override procedure is documented for branch protection blocking merges during
  unrelated CI flakiness -- acceptable for pilot scope given explicit user approval, but should be
  decided before wider rollout (echoes philosophy review's parallel note).
- `overrides`-pinned transitive versions could diverge from what a future `semantic-release` bump
  expects internally; only surfaces at actual release time. Low probability, not actionable within this
  pilot's scope.


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
