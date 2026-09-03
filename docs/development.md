# Developing on the fork

This guide is for developers contributing changes to the fork (bug fixes,
new bundled workflows, hardening, upstream merges). If you only
want to use WorkRail, stop here and read the [README](../README.md).

For project-wide rules on branches, commits, and the planning workflow, read
[`AGENTS.md`](../AGENTS.md) before opening a PR. That document is the source
of truth for how work moves through this repo.

## Clone and bootstrap

```
git clone git@github.com:ikani-pdq/workrail.git
cd workrail
./scripts/setup-hooks.sh   # activates the commit-msg quality gate
npm install                # uses corepack-pinned npm (see packageManager)
npm run build              # produces dist/ and console-ui/
```

The `preinstall` script enforces Node >= 20. CI runs against 22.14.0; align
with `.tool-versions` (`asdf install` or `nvm use`).

## Run locally without packaging

WorkRail supports two transports during development. Use HTTP for the
day-to-day inner loop; stdio is fine for one-shot runs.

### HTTP transport (recommended)

The HTTP transport survives MCP-client restarts, so you can recompile
WorkRail without losing your Claude Code session.

```
# Terminal 1 -- tsc watch
npm run watch

# Terminal 2 -- restart the MCP server on each rebuild
npm run dev:mcp:watch
```

The project-local `.mcp.json` already points Claude Code at
`http://localhost:3100/mcp`, so any client started from this repo picks up
the dev server automatically. Edits typically reach Claude in 5-10 seconds.

If you need a single manual restart (after `npm run build`):

```
npm run dev:mcp
```

### stdio transport (one-shot)

```
npm run dev
```

This builds, then launches WorkRail on stdio. Useful when you want to run
the production-shape binary against a one-off MCP client invocation.

## Run tests

```
npx vitest run                      # full suite
npx vitest run path/to/test.ts      # a single file
npx vitest run --reporter=verbose   # see every test name
```

### Known local failure: path-with-space

`tests/unit/cli-validate.test.ts` and `tests/unit/cli-version.test.ts` shell
out via `execSync` with an unquoted path. They fail locally on macOS when
your checkout sits at a path containing a space (for example,
`~/claude projects/workrail`) and pass in CI on standard runner paths.

If you see those tests failing on a clean main, that is why. Confirm with
`git stash && npx vitest run <failing-test> && git stash pop` before
attributing the failure to your changes.

## Workflows

- Cross-workflow authoring principles: [`docs/authoring-v2.md`](authoring-v2.md).
- Machine-readable lock rules: [`docs/authoring.md`](authoring.md).
- Authoring spec (schema): `spec/authoring-spec.json`.

Validation scripts you should run when you touch workflow JSON or the
authoring spec:

```
npm run validate:registry           # bundled workflows
npm run validate:authoring-spec     # spec internal consistency
npm run validate:feature-coverage   # feature-registry coverage
npm run validate:authoring-docs     # regenerates docs/authoring.md from spec
```

## Merging from upstream

The fork tracks `EtienneBBeaulac/workrail`. We rebase or merge upstream
periodically. A few files diverge by design and will produce conflicts
every merge. Resolve in this fork's favour for these:

- `package.json` -- `name`, `repository`, `bugs`, `homepage`, `publishConfig`.
- `.releaserc.cjs` -- this fork uses `@semantic-release/npm` instead of `exec`
  and drops the upstream `repositoryUrl`.
- `.github/workflows/release.yml` -- registry, scope, permissions, token
  flow. Upstream's GitHub-App-token machinery is gated behind
  `WORKRAIL_USE_RELEASE_APP`.
- `README.md` -- fork-specific content.
- `docs/development.md`, `docs/security.md` -- fork-only files that should
  not exist upstream.

When upstream renames things in `package.json` or restructures release
config, do not auto-accept their version. Re-derive the fork's shape.

## Branch and commit conventions

- Branch naming: use a short descriptive name (e.g. `fix/session-timeout`,
  `feat/loop-support`). Upstream uses `feature/etienneb/<name>`; this fork
  uses no fixed prefix convention.
- Commits follow `<type>(<scope>): <subject>` per `AGENTS.md`. The
  commit-msg hook in `.git-hooks/commit-msg` always blocks the first
  commit attempt and prints a five-point quality checklist. After you
  have self-checked, re-run the commit with `--no-verify`. This is the
  intentional design of the hook, not a bug.

## Releasing

Releases are automated by semantic-release on merge to `main`:

| Commit type | Effect |
|-------------|--------|
| `feat`      | minor bump |
| `fix`, `perf`, `revert` | patch bump |
| `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style` | no release |
| Breaking change | minor (default) or major (`WORKRAIL_ALLOW_MAJOR_RELEASE=true`) |

The release job does not publish to any package registry -- `package.json` is
`"private": true` and this fork is install-from-source only (see the README's
Install section). The release job produces a version bump, changelog, and a
tagged GitHub Release; that tag is the pinned artifact to install from. The
`WORKRAIL_USE_RELEASE_APP` repo variable controls whether the
upstream-style GitHub-App push flow is also wired up; leave it unset to
admin-merge version bumps by hand.

Background:
- Release policy: [`docs/reference/releases.md`](reference/releases.md).
- Configuration the release reads: [`docs/configuration.md`](configuration.md).

## After landing a change

Pulling local changes into Claude Code: if you are using the HTTP dev loop,
the watch + dev:mcp:watch terminals do this automatically (recompile,
restart, ~5-10 second cycle). For a binary installed via the README's
`npm pack` + `npm install -g` tarball flow, you need to rebuild, re-pack, and
reinstall the tarball to pick up changes -- usually not worth doing locally;
rely on CI for the release shape.
