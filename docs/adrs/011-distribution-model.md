# ADR-011: Canonical Distribution Model

**Status:** Adopted
**Date:** 2026-09-17

## Context

This fork (`ikani-pdq/workrail`) does not publish to any package registry — `package.json` is `"private": true` and `.releaserc.cjs` has no `@semantic-release/npm` plugin (see [ADR-010](010-release-pipeline.md), which documents the release *mechanics*; this ADR is the canonical record of the distribution/registry *decision* itself — the two are related but distinct, and this one supersedes any implication that the question is still open).

That local-install-only state was arrived at through direct experience with the risk of publishing under this project's identity, not by starting from a blank slate:

1. **PR #14** (`chore: rename to @ikani.samani/workrail, publish to public npm`) renamed the fork and published it to public npm.
2. **PR #21** (`fix: stop publishing this fork to npm`) reversed that shortly after — this fork's own package name is no longer live on the registry.
3. **PR #16** (`docs: install workrail from a local build, not the npm registry`) documented build-from-source as the supported path.
4. Separately, **ADR-010**'s update note records that `iconza98/workrail` — a personal fork/account of the maintainer's, from before this hardened fork existed — was found publishing releases *of its own* to the shared `@ikani.samani/workrail` npm package name, with provenance attestation pointing at `iconza98/workrail` rather than `ikani-pdq/workrail`. That package remains published today. It is not security-hardened to this repository's standards.

**Issue #8** (closed, unimplemented) additionally proposed renaming to `@pdq/workrail` and publishing to GitHub Packages under a PDQ-owned org. Its core acceptance criteria were never actually carried out — `package.json` is still `@ikani.samani/workrail`, still `private: true`, with no GitHub Packages configuration anywhere in the repo.

**Issue #30** asked for a deliberate, current decision on the canonical distribution model, explicitly not one left "implied by omission" — the concern being that the current local-only state, however correct, had never been formally re-examined or documented as a first-class decision, and issue #8's plan had been marked closed without ever being reconciled against it.

## Decision

**This fork remains permanently local-install-only, from `ikani-pdq/workrail` only. It will not publish to any package registry — public npm, GitHub Packages, or otherwise.**

This formally supersedes issue #8's plan to rename to `@pdq/workrail` and publish to GitHub Packages. That plan is not being carried forward.

Rationale:
- The fork has already tried public npm publishing under its own identity once (PR #14) and deliberately reversed it (PR #21) after the risk of registry-based distribution under this project's name became concrete.
- A live publish pipeline — to any registry, private or public — is additional CI attack surface: stored credentials or OIDC trust relationships, a code path that pushes artifacts outside version control review, and a target for exactly the kind of identity confusion already observed with `iconza98/workrail`. Removing that surface entirely, rather than relocating it to a different (even private) registry, is the more conservative posture and matches this fork's security-first orientation.
- Reviving GitHub Packages would not address the actual problem raised in issue #30 — the `iconza98/workrail` publish to public npm is a separate account and a separate registry from GitHub Packages. Nothing this repo does with its own publish pipeline changes what that account can publish.
- Local install (`git clone` → `npm run build` → `npm pack` → `npm install -g`) already works, is documented in the [README's Install section](../../README.md#install) and [`docs/configuration.md`](../configuration.md#quick-start), and requires no registry access, tokens, or `.npmrc` setup.

### On `iconza98/workrail`

`iconza98/workrail` is a prior personal fork/account of the maintainer's, predating this hardened fork, and is not security-hardened to `ikani-pdq/workrail`'s standards. It currently still publishes `@ikani.samani/workrail` to public npm. **This decision leaves that package published, for now** — the maintainer has the ability to deprecate or unpublish it but has chosen not to commit to a timeline for doing so as part of this decision (see the deferred backlog item this ADR's PR adds to `docs/ideas/backlog.md`). This ADR does not claim that risk is resolved; it only commits `ikani-pdq/workrail` to never being the *second* live publish source. Do not install this fork via `npx` or `npm install` from any registry for company work — always build from source per the README.

### Conditions under which this would be revisited

This is not an irreversible, permanent technical constraint — it is a deliberate posture that could change if the tradeoffs change. Specifically:
- If a PDQ-owned GitHub org is created (issue #8's own stated blocking prerequisite for GitHub Packages) *and* there is a concrete, active need for managed distribution that outweighs the reintroduced CI/publish attack surface, issue #8's plan can be reopened against this ADR rather than against a closed, stale issue.
- If `iconza98/workrail`'s continued publication under `@ikani.samani/workrail` causes active confusion or incidents, the deferred cleanup action (unpublish/deprecate) should be reprioritized ahead of its current "not scheduled" status.

## Consequences

- `package.json` stays `"private": true`; no `publishConfig` is added.
- `.releaserc.cjs` continues to produce only a version bump, changelog, and tagged GitHub Release (per ADR-010) — no registry publish step.
- Issue #8 is closed as superseded by this ADR, not as completed.
- `README.md` and `docs/configuration.md` are the user-facing surfaces for this decision; they must not describe or imply a different distribution model (see this PR's consistency-pass edits).
- The `iconza98/workrail`-sourced npm package remains a known, documented, unmitigated-for-now risk, tracked as a deferred backlog item rather than as in-scope work for this decision.

## Key files

- `docs/adrs/010-release-pipeline.md` — release mechanics (how a version is cut and tagged); this ADR — whether/where anything is published from that process.
- `package.json` (`"private": true`), `.releaserc.cjs` (no npm plugin) — the enforcement mechanism.
- `README.md` (Install section, npm badge), `docs/configuration.md` (Quick Start) — user-facing statements of this decision.
