#!/usr/bin/env node
/**
 * WorkRail CLI entry point.
 *
 * Dispatches `workrail --version`, `workrail report` and `workrail console`
 * to their CLI implementations, and falls through to the MCP server for
 * everything else (including the bare `workrail` invocation and
 * `WORKRAIL_TRANSPORT`-driven server start).
 *
 * WHY a separate file (not modifying mcp-server.ts): mcp-server.ts is the
 * MCP server entry point -- it should stay focused on transport concerns.
 * The CLI shim is a thin dispatcher that keeps the two concerns separate.
 *
 * WHY version requests are handled here rather than falling through: the
 * fall-through starts a stdio MCP server, so `workrail --version` used to
 * hang waiting on a protocol handshake instead of printing anything --
 * despite the README documenting it as the way to verify an install. Every
 * spelling of the request is claimed for the same reason; any left
 * unclaimed becomes a server rather than an error.
 *
 * Usage:
 *   workrail                   -- starts MCP server (stdio or http)
 *   workrail --version         -- prints the installed version
 *              | -v | -V | version
 *   workrail report [opts]     -- alias for: worktrain report [opts]
 *   workrail console [opts]    -- alias for: worktrain console [opts]
 */

import { isVersionRequest, runVersionRequest } from './cli/version-request.js';

const subcommand = process.argv[2];

if (isVersionRequest(subcommand)) {
  runVersionRequest(__dirname);
} else if (subcommand === 'report' || subcommand === 'console') {
  // Delegate to cli-worktrain.ts which owns these implementations.
  // We do a dynamic import so mcp-server dependencies are never loaded
  // when only CLI commands are needed.
  import('./cli-worktrain.js').catch((err) => {
    process.stderr.write(`[workrail] Failed to load CLI: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
} else {
  // Everything else: start the MCP server as before.
  import('./mcp-server.js').catch((err) => {
    process.stderr.write(`[workrail] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
