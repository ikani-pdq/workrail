# WorkRail (personal fork)

This is a personal hardened fork of [WorkRail](https://github.com/EtienneBBeaulac/workrail),
a step-by-step workflow enforcement engine for AI agents delivered as an MCP
server. The package also publishes to the npm registry as
`@ikani.samani/workrail`, but the registry is not a trusted install source --
build and install locally instead (see [Install](#install) below).

If you want the upstream public version, install `@exaudeus/workrail` from
npmjs.org instead.

## Prerequisites

- **Node.js 22.14.0** (see `.tool-versions`). The `preinstall` script enforces
  a minimum of Node 20, but CI runs against 22.14.0 and so should you.
- **npm 11.11.1 or newer** (set in `package.json` via the `packageManager`
  field; `corepack` will activate it automatically).

## Install

Install from a local build rather than the npm registry. This guarantees you
run exactly the code in this repo, with no dependency on what `latest`
happens to resolve to on npmjs.com.

```
git clone https://github.com/ikani-pdq/workrail.git
cd workrail
npm install
npm run build
npm pack
npm install -g ./ikani.samani-workrail-*.tgz
```

`npm pack` writes a tarball named `<scope>-<name>-<version>.tgz` (dots in the
scope become dashes), e.g. `ikani.samani-workrail-3.101.1.tgz` — run `ls
*.tgz` if the glob above doesn't match. No `.npmrc` configuration,
authentication token, or registry access is needed.

To upgrade later: `git pull`, rebuild, `npm pack` again, and reinstall the
new tarball the same way.

## Verify

```
workrail --version
```

This prints the version from the tarball you built and installed. If the
command is not found, confirm the global npm bin directory (`npm bin -g`) is
on your `PATH`.

## Wire up your MCP client

WorkRail is an MCP server. You point your client (Claude Code, Claude
Desktop, Cursor, Firebender, etc.) at it. Pick the section that matches your
client.

Since the [Install](#install) step above installs `workrail` globally from
your local build, every client just needs to reference the binary directly
-- no `npx`, and no registry fetch at runtime.

### Claude Code CLI

Add the server to `~/.claude.json` (or a project-local `.mcp.json`):

```json
{
  "mcpServers": {
    "workrail": {
      "command": "workrail"
    }
  }
}
```

This launches WorkRail over stdio whenever Claude Code starts.

### Claude Desktop

Add to `claude_desktop_config.json` (location varies by OS; see Anthropic's
docs):

```json
{
  "mcpServers": {
    "workrail": {
      "command": "workrail"
    }
  }
}
```

### Cursor / other MCP clients

WorkRail follows the standard stdio transport. Any client that supports an
MCP server with a command should work with the same shape as above. See
`docs/integrations/` for client-specific notes (Firebender, Docker, etc).

## First run

Once your client is wired up, ask the agent to list available workflows. It
should call WorkRail's `discover_workflows` tool and return the bundled set
(`wr.*`).

Then start one:

> "Use the wr.discovery workflow on this codebase."

WorkRail creates a session under `~/.workrail/data/sessions/<id>/`. The agent
will call `continue_workflow` between steps; you can see the live state in
the console (`worktrain console` if you have it).

## Configuration

Environment variables, workflow source paths, and config file format are
documented in [`docs/configuration.md`](docs/configuration.md). The
`env.example` at the repo root lists every variable WorkRail reads, with
inline guidance.

## Security posture

**Read [`docs/security.md`](docs/security.md) before deploying.** It covers
the workflow trust model (workflow JSON is trusted code; the workflow repo
must be reviewed like production source), network exposure (MCP HTTP
transport binds loopback by default; `WORKRAIL_HTTP_HOST` overrides it and
logs a warning), and filesystem permissions (`~/.workrail/` is mode `0o700`).

Two rules worth lifting to the front:

- Do not sync `~/.workrail/` to consumer cloud storage (Dropbox, iCloud
  Drive, Google Drive, OneDrive). Your HMAC signing keyring lives there.
- Do not set `WORKRAIL_HTTP_HOST` to anything other than a loopback address
  unless you have an authenticated reverse proxy in front of WorkRail. The
  MCP endpoint has no built-in authentication.

## Developing on the fork

If you are modifying WorkRail itself rather than just using it, see
[`docs/development.md`](docs/development.md). It covers the clone-build-run
loop, test conventions, the commit-msg hook quirk, and the upstream-merge
hot spots.

## Reporting issues

File issues in the [`ikani-pdq/workrail`](https://github.com/ikani-pdq/workrail/issues)
repository. Do not file bugs against upstream for issues that are specific to
this fork.

Do not include session manifests, keyring contents, or pasted credentials in
issue reports.

## Upstream

This fork tracks [`EtienneBBeaulac/workrail`](https://github.com/EtienneBBeaulac/workrail)
periodically. The package name, registry, README, and release workflow are
the canonical divergence points. See `docs/development.md` for the
upstream-merge playbook.
