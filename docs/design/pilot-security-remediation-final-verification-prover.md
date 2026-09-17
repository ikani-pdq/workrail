# Final Verification (Prover Lens) — Pilot Security Remediation

Verified against the working tree at `/Users/ikanisamani/claude projects/workrail`
(pre-PR — S1-S4 changes are present but uncommitted; S5 is explicitly deferred).
Lens: **prover** — every claim below was checked by actually running the
verification command and observing real output, not by trusting
`implementation_plan.md`'s notes.

## Readiness Claims and Proof Matrix

| # | Claim | Supporting evidence | Strength | Gap |
|---|---|---|---|---|
| AC-1 | Security Audit job fails on >=1 high/critical `npm audit` finding (root + `console/`); no tee/grep masking; summary `if: success()`; SBOM steps `if: always()` | Read `.github/workflows/ci.yml` L243-296 directly: two bare `npm audit --audit-level=high` invocations (root L268, `working-directory: console` L270-272), zero `tee`/grep anywhere in the job; "Security audit summary" (L274) has `if: success()`; "Generate SBOM" (L281) and "Upload SBOM artifact" (L290) both have `if: always()`; job has no `continue-on-error`, so a failing audit step fails the job under default GHA semantics | **Strong** | No live GHA run observed yet (no PR open) — logic verified by direct reading + equivalent local execution, not by an actual CI run |
| AC-2 | `npm audit --audit-level=high` clean at root and `console/`; typecheck and test suite pass except the two known pre-existing failures | Ran all four commands live (see Validation Evidence Summary) | **Strong** | None |
| AC-3 | `.mcp.json` `workrail` entry pins `3.101.1`, refuses on mismatch, execs on match, stays local-install-only, works from a shared/git-tracked config | Read `.mcp.json` L11-14; executed the *actual parsed* `command`+`args` via `execFileSync` for both match and mismatch branches; `grep -nE "/Users/|/home/|~" .mcp.json` → no matches | **Strong** | None |
| AC-4 | No untracked `*.tgz`; `.gitignore` covers future `npm pack` output | `git status --porcelain` → no `.tgz` entry; `grep -n tgz .gitignore` → line 11 `*.tgz`; live `touch test.tgz && git check-ignore` smoke test → matched, cleaned up | **Strong** | None |
| AC-5 | Branch protection deliberately deferred (not skipped), applied after this PR's CI is green | Read `implementation_plan.md` L22-24, L146-151 — explicit deferred-item framing with sequencing rationale, corroborated by two design reviews; live-checked `gh api repos/ikani-pdq/workrail/branches/main/protection` → 404 today, matching the documented deferred (not silently-done, not silently-forgotten) state | **Strong** | None — absence right now is expected per plan, not a failure |

## Validation Evidence Summary

All commands executed directly in this session; exit codes captured for real (not inferred from log tails):

- `npm audit --audit-level=high` (root) → **exit 0**. 3 *moderate* `@vitest/mocker`/`vitest`/`@vitest/ui` findings only, below the `high` gate threshold — correctly does not fail the step.
- `npm audit --audit-level=high` (`console/`) → **exit 0**, `found 0 vulnerabilities`.
- `npm run typecheck` → **exit 0**, clean `tsc --noEmit`.
- `npx vitest run --exclude="tests/contract/**"` → **exit 1**. `Test Files 2 failed | 417 passed (419)`; `Tests 22 failed | 6450 passed | 10 skipped (6482)`. Failing files are **exactly** `tests/unit/cli-validate.test.ts` (21) and `tests/unit/cli-version.test.ts` (1) — no other file fails. Root cause independently confirmed from the actual error text: `Cannot find module '/Users/ikanisamani/claude'` — an unquoted path-with-space in those tests' `execSync` calls. Matches the documented pre-existing, non-regression failure mode exactly. **No other regression found.**
- `.mcp.json` AC-3 mechanism, executed via `execFileSync(cmd, args, {encoding:'utf8', timeout:5000})` exactly as an MCP client spawns it:
  - Match branch (real file, pinned `3.101.1` == installed `3.101.1`): reached `exec workrail` — real startup log lines observed (`[Startup] transport=stdio ...`, `[Transport] WorkRail MCP Server running on stdio`, clean shutdown on stdin close).
  - Mismatch branch (pinned string swapped to an impossible version): `execFileSync` threw `status: 1`, stderr `"workrail: pinned version ... not found (installed: 3.101.1). Reinstall: ..."`, no server startup lines.
- `npx semantic-release --dry-run --no-ci --verify-conditions false` → **exit 0**, completed through `Published release 3.122.1 on default channel` with real generated release notes — confirms S2's dependency bump (`vitest`/`@vitest/ui` `^3.2.4`→`^3.2.7`, `package.json` diff is a clean 2-line caret bump, `package-lock.json` mechanically regenerated) did not break `semantic-release` plugin resolution.
- `gh api repos/ikani-pdq/workrail/branches/main/protection` → **404 "Branch not protected"**, confirming AC-5's deferred state live.

## Severity-Classified Gaps

**Red (blocking):** none.

**Orange (should fix before shipping):** none.

**Yellow (accepted tension / follow-up):**
- No live GitHub Actions run of the rewritten Security Audit job yet (no PR open). YAML logic is unambiguous on direct read and locally-equivalent execution passes; recommend confirming once the PR's CI run completes, per the plan's own S1 test design.
- 3 moderate `@vitest/mocker`-family findings remain unresolved — explicitly out of scope for AC-2 (`--audit-level=high` only).
- Branch protection (AC-5) not yet applied — by design, deferred until this PR's CI is confirmed green.
- `.mcp.json`'s final `exec workrail` is still PATH-dependent for resolving the installed binary — structurally unavoidable for a local-exec launcher; plan's risk register accepts this as non-regressive versus today's bare `command: workrail`.
- CI `run:` steps (including the new security job) don't explicitly declare `shell: bash` — pre-existing repo-wide pattern, not introduced by this diff.

## Regression / Drift Review

No regressions: the only failing tests reproduce the exact documented pre-existing path-with-space failure mode, confirmed via the actual error text. No drift from `implementation_plan.md`'s Selected Approach was found in the artifacts read/executed; the one deviation (no `package.json` `overrides` needed) is a simpler successful path than the plan's worst-case branch, not a weakening of AC-2's actual requirement (0 high/critical, verified clean).

## Philosophy Alignment

Satisfied and verified: errors-are-data / explicit exit code (AC-1, no tee/grep), architectural fix over patch (AC-1), determinism over cleverness (AC-3, `npm root -g` not hardcoded paths), dependency changes via lockfile tooling (AC-2, minimal semver bump + full lockfile regen, not hand-edited), pass/fail via `needs.<job>.result` (new security job wired into `ci-success` identically to existing jobs), local-install-only for `.mcp.json` (no hosted-package reference anywhere in the launcher).

Accepted tensions (both Yellow, both pre-existing/non-regressive per the plan's own risk register): `.mcp.json`'s final `exec workrail` PATH dependence; CI steps not explicitly declaring `shell: bash`.

## Recommended Fixes

None required to ship. Optional, non-blocking follow-ups: (1) confirm the live GHA run once a PR is opened, per S1's test design; (2) proceed with AC-5 (`gh api` branch protection) immediately after that PR's CI is green, per the plan's stated sequencing.

## Readiness Verdict

**Ready with Accepted Tensions.** All five acceptance criteria hold under direct, adversarial re-verification (real command execution, not trusted notes). Zero Red or Orange findings. The Yellow items are either explicitly deferred by design (AC-5), out of scope (moderate-only audit findings), or structurally inherent and already risk-accepted in the plan (PATH dependence in the local-exec launcher). The two pre-existing test failures are confirmed non-regressive by matching exact file/test count and root-cause error text.


---

## Pass 2 addendum (independent re-verification of the two applied fixes)

- `.mcp.json`: re-parsed the file and re-executed the exact `command`+`args` via `execFileSync` -- match case still reaches `exec workrail` (real server startup observed again); the `PINNED` variable now appears once and is referenced twice, confirmed via direct inspection of the file's `args` array.
- `.github/workflows/ci.yml`: `grep -n "if:"` confirms both SBOM steps now read `if: ${{ !cancelled() }}` (no more `always()`), and the step-naming asymmetry is resolved (`Run security audit (root)` / `Run security audit (console/)`).
- `npm audit --audit-level=high` re-confirmed clean (exit 0) at both root and `console/` -- the style fixes did not touch dependencies and nothing regressed.

No new findings. Both applied fixes hold under independent re-check.
