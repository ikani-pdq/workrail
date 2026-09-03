<div align="center">
  <img src="./assets/logo.svg" alt="WorkRail Logo" width="180" />
  <h1>WorkRail</h1>
  <p>Step-by-step workflow enforcement for AI agents</p>

[![npm version](https://img.shields.io/npm/v/@exaudeus/workrail.svg)](https://www.npmjs.com/package/@exaudeus/workrail)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
</div>

---

## The Problem

AI agents are eager to help. Too eager.

Ask one to fix a bug and it starts editing code immediately - before understanding the system, before
considering alternatives, before verifying assumptions. It's not stupid; it's a predictive model
doing what predictive models do: fill in gaps and race to an answer.

You can add system prompts or skills: "plan before coding," "gather context first," "follow our
architecture guidelines." But system prompts fade as conversations grow. Skills front-load all
guidance at once - which works for simple tasks but breaks down when the task is long and the
guidance is complex. The agent reverts to its default: assume, predict, jump to conclusions.

The deeper problems compound from there:

- **Tasks left incomplete** - the agent ships something that looks done but skips the hard parts
- **Guidelines ignored** - your architecture rules, best practices, and team conventions aren't enforced; the agent knows them but doesn't apply them
- **No audit trail** - when AI work goes wrong, there's no record of what decisions were made or why
- **Context lost between sessions** - every new conversation starts from zero; prior work, decisions, and context vanish
- **Parallelism is chaos** - running multiple AI tasks simultaneously means constant context-switching and re-explaining; there's no shared structure

**The result: inconsistent quality that depends on how much you babysit the agent.**

---

## How WorkRail Works

WorkRail replaces the human effort of guiding an agent step-by-step.

Instead of one system prompt that fades over time, WorkRail drip-feeds instructions through
the [Model Context Protocol](https://modelcontextprotocol.org). The agent calls `start_workflow`,
gets the first step, completes it, calls `continue_workflow`. Future steps stay hidden until previous ones are done.

**The agent can't skip to implementation because it doesn't know those steps exist yet.**

Sessions are durable. Work is saved to disk at every step and can be resumed across conversations
with `resume_session` — pick up exactly where you left off, even days later or in a fresh chat.

### The Mechanism

```
You                      Agent                     WorkRail
 │                         │                          │
 │  "Fix the auth bug"     │                          │
 │────────────────────────>│                          │
 │                         │                          │
 │                         │  start_workflow()        │
 │                         │─────────────────────────>│
 │                         │                          │
 │                         │   Step 1: Understand     │
 │                         │      the problem         │
 │                         │<─────────────────────────│
 │                         │                          │
 │   "What error do you    │                          │
 │    see exactly?"        │                          │
 │<────────────────────────│                          │
 │                         │                          │
 │         ...             │  continue_workflow()     │
 │                         │─────────────────────────>│
 │                         │                          │
 │                         │   Step 2: Plan your      │
 │                         │      investigation       │
 │                         │<─────────────────────────│
```

### Without WorkRail

```
You:   "There's a bug in the auth flow"

Agent: "I see the issue! In auth.js line 42, there's a null check that 
        should handle this. Let me fix it..."
        
        *edits code based on a 30-second skim*
        *breaks something else*
```

### With WorkRail

```
You:   "There's a bug in the auth flow"

Agent: "I'll use the bug-investigation workflow."
        → start_workflow()
       
       Step 1: Investigation Setup
       "Before I investigate, I need to understand the problem.
        What exactly happens when it fails? Can you share the error?"
       
       [Documents bug, reproduction steps, environment]
        → continue_workflow()
       
       Step 2: Plan Investigation
       "I'll trace execution from login through the auth middleware.
        Key areas: token validation, session lookup, error handling."
       
       [Creates investigation plan before touching code]
        → continue_workflow()
       
       Step 3: Form Hypotheses
       "Based on my analysis, three possible causes:
        H1: Clock skew in token validation (7/10)
        H2: Race condition in session lookup (6/10)
        H3: Null check masking the real error (4/10)"
       
       [Tests hypotheses systematically, gathers evidence, proves root cause]
```

Same agent. Same model. But it prepared properly because it had no choice.

### Why Steps Are Structured This Way

Each step follows a pattern that prevents common AI failure modes:

- **Prep**: Understand before acting - read the code, clarify requirements, confirm approach
- **Implement**: One focused change - not five things at once
- **Verify**: Validate before continuing - catch errors before they compound

This isn't arbitrary structure. It's how experienced developers actually work.

### Durable Sessions

Sessions persist to disk at every step. Close the chat, come back tomorrow, pick up exactly where
you left off:

```
# New conversation, days later
> "Resume the auth refactor I was working on"

Agent: → resume_session()

WorkRail: Found your session from 3 days ago.
          You were on Step 4: Implement token rotation.
          Here's what you had documented so far...
```

Each step's output — notes, decisions, artifacts — is saved and concatenated automatically. No
context re-setup. No re-explaining what was already done.

### Visibility and Audit Trail

The WorkRail Console is a browser dashboard that shows every active and completed session. It
auto-boots when you use WorkRail and gives you a live view of what the agent is doing, what it has
done, and what decisions it made at each step.

Open it anytime with `worktrain console`.

### Running Tasks in Parallel

Because sessions are independent and durable, you can run multiple AI tasks simultaneously without
babysitting any of them. Start five workflows, let each agent work through its steps, check in when
they checkpoint. No context-switching overhead — each session has its own complete state.

### Why This Beats System Prompts

| System Prompt / Skill | WorkRail |
|-----------------------|----------|
| "Plan first" fades as context grows | Each step is fresh and immediate |
| Agent decides what to follow | Agent can't skip - next step is hidden |
| Skills front-load all guidance at once | Guidance is delivered one step at a time, in context |
| One-size-fits-all instructions | Workflows encode your team's rules and best practices |
| Inconsistent results | Repeatable, consistent quality |
| Stateless — context lost when chat ends | Durable sessions — resume exactly where you left off |
| One task at a time or constant context-switching | Independent sessions run in parallel without babysitting |

---

# WorkRail (work fork)

This is a personal hardened fork of [WorkRail](https://github.com/EtienneBBeaulac/workrail),
a step-by-step workflow enforcement engine for AI agents delivered as an MCP
server. `package.json` is `private: true` -- this fork is **not published to
the npm registry**. Build and install locally instead (see
[Install](#install) below); do not `npm install` or `npx` any
`@ikani.samani/workrail` version, published or otherwise, as an install path
for this fork.

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
non-loopback values refuse to start), and filesystem permissions
(`~/.workrail/` is mode `0o700`).

Two rules worth lifting to the front:

- Do not sync `~/.workrail/` to consumer cloud storage (Dropbox, iCloud
  Drive, Google Drive, OneDrive). Your HMAC signing keyring lives there.
- Do not set `WORKRAIL_HTTP_HOST` to anything other than a loopback address.
  The MCP endpoint has no built-in authentication, so WorkRail refuses to
  start rather than bind beyond loopback -- there is no override flag.

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
