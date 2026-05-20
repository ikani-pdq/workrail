# WorkRail (PDQ internal fork)

This is PDQ's hardened internal fork of [WorkRail](https://github.com/EtienneBBeaulac/workrail),
a step-by-step workflow enforcement engine for AI agents delivered as an MCP
server. It is published privately as `@pdq/workrail` and is intended for use on
PDQ engineers' own machines.

If you want the public version, install `@exaudeus/workrail` from npmjs.org
instead. This fork is configured for internal distribution and includes
security defaults that may differ from upstream.

## Prerequisites

- **Node.js 22.14.0** (see `.tool-versions`). The `preinstall` script enforces
  a minimum of Node 20, but CI runs against 22.14.0 and so should you.
- **npm 11.11.1 or newer** (set in `package.json` via the `packageManager`
  field; `corepack` will activate it automatically).
- **A GitHub Personal Access Token with `read:packages` scope**. Create one at
  https://github.com/settings/tokens. Keep it long-lived; rotate it on the
  same cadence you rotate the rest of your dev tokens.

## Install

WorkRail is published to GitHub Packages, not the public npm registry. You
need a `.npmrc` that points the `@pdq` scope at GitHub Packages and
authenticates as you. **You do not need to clone this repository to install
WorkRail.**

### 1. Get a GitHub Personal Access Token

Create a classic PAT at https://github.com/settings/tokens/new with the
`read:packages` scope checked. If your account is in a SAML SSO org, also
click "Configure SSO" on the new token and authorize it for the PDQ org
that hosts `@pdq/workrail`. Without that authorization the token works for
everything else but cannot read PDQ-private packages.

### 2. Configure `~/.npmrc`

Open `~/.npmrc` in your editor (create the file if it does not exist) and
add these two lines, replacing `YOUR_PAT_HERE` with the token from step 1:

```
@pdq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_PAT_HERE
```

If you prefer to scope the auth to a single project, create `./.npmrc` in
that project's root instead. The content is identical.

Do not commit any `.npmrc` that contains a real token. Add it to your
global gitignore if you keep it project-local.

### 3. Install

```
npm install -g @pdq/workrail
```

### 4. Verify

```
workrail --version
```

This prints the published package version when everything is wired up
correctly. If you see one of these errors:

- **`404 Not Found`** -- the `@pdq` scope is not yet hosted on a PDQ-owned
  GitHub org (a rollout prerequisite tracked in #8). The package has not
  been published anywhere you can reach yet.
- **`403 Forbidden`** -- your PAT is missing the `read:packages` scope, or
  the token has not been SSO-authorized for the PDQ org.
- **`E401 Unauthorized`** -- the token is wrong or expired. Regenerate it
  and update `~/.npmrc`.

## Wire up your MCP client

WorkRail is an MCP server. You point your client (Claude Code, Claude
Desktop, Cursor, Firebender, etc.) at it. Pick the section that matches your
client.

### Claude Code CLI

Add the server to `~/.claude.json` (or a project-local `.mcp.json`):

```json
{
  "mcpServers": {
    "workrail": {
      "command": "npx",
      "args": ["-y", "@pdq/workrail"]
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
      "command": "npx",
      "args": ["-y", "@pdq/workrail"]
    }
  }
}
```

### Cursor / other MCP clients

WorkRail follows the standard stdio transport. Any client that supports an
MCP server with a command and args should work with the same shape as above.
See `docs/integrations/` for client-specific notes (Firebender, Docker, etc).

### Local dev binary (alternative to `npx`)

If you want a faster startup or do not want `npx` to fetch the package each
time, install once globally and then reference the binary directly:

```json
{
  "mcpServers": {
    "workrail": {
      "command": "workrail"
    }
  }
}
```

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
inline guidance on which ones are PDQ-specific defaults.

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
repository (or whichever PDQ-owned repo currently hosts the fork). Do not
file PDQ-internal bugs against upstream.

Do not include session manifests, keyring contents, or pasted credentials in
issue reports.

## Upstream

This fork tracks [`EtienneBBeaulac/workrail`](https://github.com/EtienneBBeaulac/workrail)
periodically. The package name, registry, README, and release workflow are
the canonical divergence points. See `docs/development.md` for the
upstream-merge playbook.
