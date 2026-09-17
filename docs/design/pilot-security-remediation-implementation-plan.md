# Implementation Plan -- Pilot Security Remediation

## Problem statement

Before the WorkRail pilot can begin, four security requirements from the pilot
owner must be met, and a security review of this repo surfaced that none of them
currently hold:

1. The CI "Security Audit" job in `.github/workflows/ci.yml` cannot actually block
   a merge on high/critical `npm audit` findings -- a `tee`-pipe masks the real
   exit code, and the `if/else` that follows only prints text.
2. The dependency tree currently has 3 critical + 10 high `npm audit` findings
   (handlebars, vitest/@vitest/ui, ip-address, lodash/lodash-es, brace-expansion,
   fast-uri, nanoid, path-to-regexp, tar), unresolved because of (1).
3. `.mcp.json`'s `workrail` entry is `{"command": "workrail"}` -- unpinned,
   PATH-resolved, and (per explicit user directive) must stay local-install-only,
   never referencing the hosted `@ikani.samani/workrail` npm package (whose
   provenance traces to a different, non-canonical fork).
4. An untracked build tarball (`ikani.samani-workrail-3.101.1.tgz`) sits in the
   repo root, not gitignored.

A fifth item was added mid-task with explicit user approval: `main` has zero
branch protection (confirmed via `gh api .../branches/main/protection` -> 404),
so even a correctly-failing CI check wouldn't technically block a merge.

## Acceptance criteria (traced to Phase 0-7 IDs)

- **AC-1** (Phase 0-7): The `Security Audit` job fails whenever `npm audit
  --audit-level=high` finds >=1 high/critical vulnerability.
- **AC-2** (Phase 0-7, extended during Phase 4a plan audit -- see delta below):
  `npm audit --audit-level=high` reports zero high/critical vulnerabilities
  against both the root and `console/` lockfiles.
- **AC-3** (Phase 0-7, mechanism revised during design review -- see Selected
  Approach): The `workrail` entry in `.mcp.json` pins and verifies an exact
  approved version, stays local-install-only, and works correctly from a shared,
  git-tracked config (not just on the author's machine).
- **AC-4** (Phase 0-7): No untracked `*.tgz` in the working tree; `.gitignore`
  excludes future `npm pack` output.
- **AC-5** (Phase 0-7, added after user approval mid-task): `main` branch
  protection requires the CI success check before merge.
- **New, not from Phase 0-7** (discovered during design review, one-sentence
  rationale): the `.mcp.json` fix must additionally not silently break for any
  pilot participant whose machine differs from the author's -- added because
  `.mcp.json` was confirmed git-tracked/shared (`git log` has prior commits), which
  Phase 0-7 didn't call out explicitly when AC-3 was first written.

**Requirements-change delta (Phase 4a plan audit)**: AC-2 originally read "npm
audit clean against the root lockfile"; extended to "npm audit clean against both
the root and `console/` lockfiles" after confirming `console/` has its own
`package-lock.json` and is never covered by the root `npm audit` invocation
(`console/` only appears in `ci.yml`'s change-detection path filter, never in the
security job). `console/` ships as part of the product via the root
`console:build` script and was implicitly in-scope for "provide SBOM/dependency-
scan results" from the original ask -- leaving it unaudited would reintroduce
exactly the kind of gap this task exists to close. Currently 0 vulnerabilities
there (no urgent live risk), but the blind spot was structural.

## Non-goals

- Deciding the canonical repo between `ikani-pdq/workrail` and the downstream
  personal fork `iconza98/workrail` that currently publishes to the public npm
  registry, or disabling that fork's publish pipeline.
- Publishing any new npm version, or renaming the package / changing its registry
  (relevant history found: closed issue `ikani-pdq/workrail#8` planned a
  `@pdq/workrail` / GitHub Packages move that was never actually realized -- not
  re-litigated here).
- Fixing the now-inaccurate "this fork does not publish to npm registry" claim in
  README.md / docs/configuration.md -- filed as a follow-up instead.
- Touching `src/v2/durable-core/`, `triggers.yml`, or daemon/trigger source.

## Philosophy-driven constraints (carried from Phase 0c, unchanged)

Full list in `docs/design/pilot-security-remediation-candidates.md`'s constraint
orientation section; the ones that actively shaped implementation:
- **[PHILOSOPHY]** CI failure must be an explicit non-zero exit, not text output.
- **[PHILOSOPHY]** `.mcp.json` must be deterministic -- readable-from-the-config,
  no dependence on ambient PATH state.
- **[CONVENTION]** Dependency changes flow through lockfile tooling
  (`npm audit fix` / `npm install` / `overrides`), never hand-edited.
- **[CONVENTION]** Pass/fail is expressed via job exit codes consumed by
  `needs.<job>.result`, matching every other required job in `ci.yml`.
- **[TEAM_RULE]** Bash-explicit, never `sh`-portable-but-weaker constructs.
- **[TEAM_RULE]** No `git add -A`/`git add .` -- stage files by name.
- **[TEAM_RULE]** Local-install-only for `.mcp.json`, no exceptions.
- **[TEAM_RULE]** Commit type/scope conventions (`chore` for CI/tooling, no
  `ci`/`deps` scopes).

## Invariants

- The audit gate's pass/fail must be derivable purely from the exit code of an
  unmodified `npm audit --audit-level=high` invocation -- checkable by running
  that exact command and inspecting `$?`, at both root and `console/`.
- `.mcp.json`'s `workrail` entry must contain no absolute path that varies by
  machine (checkable by grep -- the committed file must not contain `/Users/`,
  `/home/`, or `~`).
- `semantic-release`'s dependency resolution must still succeed after any
  dependency changes -- checkable via `node ./node_modules/semantic-release/bin/
  semantic-release.js --dry-run --no-ci`.
- `git status --porcelain` shows no untracked `*.tgz` at the end of the task.
- Branch protection, once enabled, must name the exact existing "CI Success"
  status-check context (not a guessed name) -- checkable via
  `gh api .../branches/main/protection` after enabling.

## Selected approach + rationale

(Full rationale and rejected alternatives in
`docs/design/pilot-security-remediation-candidates.md`; pressure-test and
two-pass empirical review in
`docs/design/pilot-security-remediation-design-review-*.md`.)

1. **CI gate**: replaced the `tee`+grep pattern with a bare, single
   `npm audit --audit-level=high` invocation as the sole gating command per
   target (root, then a second identical invocation with `working-directory:
   console`) -- relies on the job's existing `bash -e`. A separate step gated
   `if: success()` writes an optional static "no vulnerabilities found" summary
   line (no second audit invocation). SBOM generation/upload steps use
   `if: ${{ !cancelled() }}` so they still run/upload on a failing audit but not
   on a cancelled run.
2. **Dependency remediation**: `npm audit fix` (no `--force`) resolved
   handlebars/lodash/lodash-es/fast-uri/nanoid/path-to-regexp/brace-expansion/
   ip-address/tar automatically -- all transitive-only via the `semantic-release`
   toolchain, zero `src/` usage confirmed, **no `package.json` overrides needed**
   (the anticipated fallback did not materialize). Remaining critical findings
   (vitest, @vitest/ui) cleared via a non-breaking patch bump (`^3.2.4` ->
   `^3.2.7`, already within the existing semver range -- no major bump, no
   `--force`). 3 moderate-severity findings remain (@vitest/mocker), below the
   `--audit-level=high` gate, deliberately not force-fixed (would require
   vitest 5.x). `console/` re-verified clean (0 vulnerabilities), no changes
   needed there. Verified `semantic-release --dry-run` succeeds end-to-end after
   the bumps.
3. **`.mcp.json` pin** (mechanism changed during design review after two
   concrete defects were found and fixed): keep the existing, unchanged
   `npm pack` + `npm install -g <tarball>` local-install flow (no `--prefix`, no
   per-machine path -- that was the original design, found to break for every
   pilot participant except its author since `.mcp.json` is git-shared). Instead,
   `.mcp.json` itself asserts the exact pinned version at launch time by reading
   the installed package's `package.json` via a machine-relative lookup
   (`npm root -g`), refusing to start on a mismatch:
   ```json
   "workrail": {
     "command": "bash",
     "args": ["-c", "PINNED=3.101.1; v=$(node -p \"require('$(npm root -g)/@ikani.samani/workrail/package.json').version\" 2>/dev/null); if [ \"$v\" != \"$PINNED\" ]; then echo \"workrail: pinned version $PINNED not found (installed: ${v:-none}). Reinstall: npm pack && npm install -g ./ikani.samani-workrail-$PINNED.tgz\" >&2; exit 1; fi; exec workrail"]
   }
   ```
   Verified end-to-end (both match and mismatch branches) via true argv passing
   (`execFileSync('bash', ['-c', script])`), matching exactly how an MCP client
   spawns `command`+`args`. `PINNED` is a manually-maintained variable, bumped
   deliberately alongside each newly approved release -- that's the intended
   behavior of a pin, not a gap. (Extracted to a single `PINNED` variable during
   Phase 7 final verification after a code-smell review flagged the version
   string being duplicated inline in two places.)
4. **Tarball cleanup**: `git status` confirmed the tarball was untracked (not
   staged) -- deleted it and added `*.tgz` to `.gitignore`.
5. **Branch protection**: to be enabled via `gh api` directly against the repo
   (not part of the PR diff), requiring the existing "CI Success" status check,
   applied *after* this task's PR is opened and its own CI run is confirmed
   green -- to avoid any interaction between activating the gate and the very PR
   that fixes what it gates (sequencing risk independently corroborated by two
   design reviews).

## Slices

| Slice | Scope | Files | AC |
|---|---|---|---|
| S1 | CI audit-gate fix (root + `console/` audit, `if:always()`->`!cancelled()` on SBOM) | `.github/workflows/ci.yml` | AC-1 |
| S2 | Dependency remediation (root + console) | `package.json`, `package-lock.json` | AC-2 (extended to `console/`) |
| S3 | `.mcp.json` version-pin launcher | `.mcp.json` | AC-3 |
| S4 | Repo hygiene: remove stray tarball, gitignore `*.tgz` | `.gitignore` | AC-4 |
| S5 | Branch protection (repo setting, not a file change) | GitHub repo settings via `gh api` | AC-5 |

S1-S4 shipped together in one PR (see PR packaging). S5 is a direct `gh api` call
made by the implementer after S1-S4's PR is green, not a commit.

## Test design

- **S1**: Reproduced the exact fixed step logic locally against the pre-fix
  (vulnerable) lockfile -> exit 1; after S2 landed -> exit 0. On the PR's real CI
  run: confirm `Security Audit` and `CI Success` both report success, and the
  SBOM artifact is still uploaded.
- **S2**: `npm audit --audit-level=high` exits 0 locally and in CI, at both the
  repo root and inside `console/`. `npx vitest run` (full suite) -- 6450 passed,
  22 pre-existing failures (confirmed via `git stash`, unrelated path-with-spaces
  issue), 10 skipped. `node ./node_modules/semantic-release/bin/
  semantic-release.js --dry-run --no-ci` passed end-to-end (validates `vitest`
  bump didn't break plugin resolution).
- **S3**: Verified via `execFileSync('bash', ['-c', script])` for both the match
  and mismatch branches, parsed directly from the committed `.mcp.json` (not a
  hand-typed reproduction) -- reached real WorkRail server startup on match,
  correct refusal message on mismatch. Manual check recommended before pilot
  rollout: restart the MCP connection in a live client on a second machine.
- **S4**: `git status --porcelain` shows no untracked `.tgz`; `git check-ignore`
  smoke test confirmed the new rule works.
- **S5**: `gh api repos/ikani-pdq/workrail/branches/main/protection` should
  return 200 with `required_status_checks.contexts` including the CI Success
  check name, once applied.

## Risk register

| Risk | Slice | Mitigation | Outcome |
|---|---|---|---|
| `overrides` for handlebars/lodash break `semantic-release` plugin resolution | S2 | Verify via live dry-run before merging | **Did not materialize** -- no overrides were needed at all; dry-run passed |
| SBOM step silently skipped on first real audit failure | S1 | `if: ${{ !cancelled() }}` added explicitly | Resolved |
| `.mcp.json` PATH resolution unverified on other pilot participants' machines/shells | S3 | Accepted, non-regressive -- identical unknown already exists in today's bare `command: workrail` config | Accepted |
| Sequencing: hardened gate + branch protection landing before dependency fix could make the fix PR itself unmergeable | S1/S2/S5 | All code changes (S1-S4) ship in one PR; branch protection (S5) applied only after that PR's own CI is confirmed green | Resolved by construction |
| `PINNED` string in `.mcp.json` goes stale after a future release | S3 | Documented as a manually-maintained pin, bumped deliberately per approved release | Accepted (intended behavior) |

## PR packaging

**1 PR** containing S1-S4 (`ci.yml`, `package.json`/`package-lock.json`,
`.mcp.json`, `.gitignore` + tarball removal), commits staged by name (never
`git add -A`), each following the AGENTS.md commit-type/scope table (`chore` for
the CI/tooling and config changes here, no `ci`/`deps` scope). S5 (branch
protection) is a separate `gh api` action taken after that PR merges and CI is
confirmed green -- not part of the PR.

## Philosophy alignment per slice

- S1: errors-are-data (explicit exit code), architectural-fix-over-patch
  (replaces the broken mechanism rather than patching its symptom).
- S2: validate-at-boundaries (dependency tree), lockfile-tooling convention.
- S3: determinism-over-cleverness (version-verified, machine-relative, no hidden
  PATH state), local-install-only team rule.
- S4/S5: mechanical, no philosophy tension.

## Follow-up tickets

1. Fix README.md/docs/configuration.md's now-inaccurate "we don't publish to npm
   registry" claim (a sibling fork publishes `@ikani.samani/workrail` publicly).
2. Revisit the canonical-repo / publish-strategy question (`ikani-pdq/workrail`
   vs `iconza98/workrail`), informed by the historical closed issue `#8`.
3. If the pilot ever needs cross-platform (Windows) or stronger-isolation
   guarantees for the MCP pin, revisit the previously-rejected Docker-image
   candidate (MCP-D).
4. Add `cache-dependency-path` for `console/`'s lockfile to the CI `setup-node`
   step (perf-only; deferred as out of proportion for this task's blast radius).

## Final status

- **estimatedPRCount**: 1
- **unresolvedUnknownCount**: 0 -- the one flagged unknown (semantic-release
  override compatibility) was resolved during implementation (no overrides
  needed at all).
- **planConfidenceBand**: High.
- All five acceptance criteria (AC-1 through AC-5) confirmed via two independent
  adversarial verification lenses -- see
  `docs/design/pilot-security-remediation-final-verification-*.md`. AC-5
  deliberately deferred to post-merge, not skipped.
