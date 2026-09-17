#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * Resolves transport mode from environment and starts the appropriate server.
 *
 * Environment:
 * - WORKRAIL_TRANSPORT: 'stdio' (default) | 'http'
 * - WORKRAIL_HTTP_PORT: port for HTTP mode (default: 3100)
 */

import fs from 'fs';
import path from 'path';
import { resolveTransportMode } from './mcp/transports/transport-mode.js';
import { startStdioServer } from './mcp/transports/stdio-entry.js';
import { startHttpServer } from './mcp/transports/http-entry.js';
import { assertNever } from './runtime/assert-never.js';
import { checkPackageProvenance } from './runtime/verify-package-provenance.js';

// Public API: transport entry points
export { startStdioServer } from './mcp/transports/stdio-entry.js';
export { startHttpServer } from './mcp/transports/http-entry.js';
export { composeServer } from './mcp/server.js';

// Fails closed, no override: an install whose own package.json doesn't point
// back at ikani-pdq/workrail may be an unaudited fork or a mismatched
// install (see docs/security.md). Mirrors the WORKRAIL_HTTP_HOST loopback
// guard's posture -- refuse rather than warn-and-continue.
function assertKnownProvenance(): void {
  const pkgPath = path.resolve(__dirname, '../package.json');
  let raw: string;
  try {
    raw = fs.readFileSync(pkgPath, 'utf8');
  } catch {
    process.stderr.write(
      `[workrail] Refusing to start: could not read this install's own package.json ` +
        `(${pkgPath}) to verify provenance.\n`
    );
    process.exit(1);
    return;
  }

  const result = checkPackageProvenance(raw);
  if (result.ok) return;

  process.stderr.write(
    `[workrail] Refusing to start: this install's package.json repository field ` +
      `("${result.repositoryUrl ?? 'missing'}") does not point at the audited source ` +
      `(expected a URL containing "github.com/ikani-pdq/workrail"). ` +
      `Detected package: ${result.name ?? 'unknown'}@${result.version ?? 'unknown'}. ` +
      `This may be an unaudited fork or a stale/mismatched install. Reinstall from ` +
      `https://github.com/ikani-pdq/workrail per the README's Install section.\n`
  );
  process.exit(1);
}

async function main(): Promise<void> {
  assertKnownProvenance();

  const mode = resolveTransportMode(process.env);

  switch (mode.kind) {
    case 'stdio':
      await startStdioServer();
      break;

    case 'http':
      await startHttpServer(mode.port);
      break;

    default:
      assertNever(mode);
  }
}

main().catch((error) => {
  console.error('[Startup] Fatal error:', error);
  process.exit(1);
});
