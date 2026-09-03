/**
 * HTTP transport entry point for WorkRail MCP server.
 * 
 * This is the bot service use case — connects over HTTP using the MCP SDK's
 * StreamableHTTPServerTransport. No workspace roots (bot passes explicit
 * workspacePath on start_workflow).
 * 
 * Philosophy:
 * - Determinism: enableJsonResponse=true for simple request/response
 * - Fail-fast: port conflict throws immediately
 * - Validate at boundaries: HTTP and stdio use same composeServer()
 */

import { composeServer } from '../server.js';
import { bindWithPortFallback, DEFAULT_BIND_HOST } from './http-listener.js';
import { wireShutdownHooks } from './shutdown-hooks.js';
import { registerFatalHandlers, logStartup, registerGracefulShutdown, fatalExit } from './fatal-exit.js';
import * as crypto from 'crypto';
import express from 'express';

/** Inclusive upper bound for the HTTP port scan range. Scan starts at the requested port. */
const HTTP_PORT_SCAN_END = 3199;

/** Host names that are considered loopback-only. Binds to anything else
 * refuses to start because the MCP endpoint has no auth. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export async function startHttpServer(port: number): Promise<void> {
  // Register early — before composeServer() — so startup failures exit cleanly.
  registerFatalHandlers('http');
  logStartup('http', { port });

  // Loopback by default; WORKRAIL_HTTP_HOST overrides. The MCP endpoint has no
  // auth, so non-loopback binds expose every tool call to anyone who can reach
  // the port. Checked before composeServer() so an invalid host never pays for
  // full server composition, and refused outright rather than just warned —
  // there is no authentication layer to fall back on.
  const host = (process.env.WORKRAIL_HTTP_HOST ?? DEFAULT_BIND_HOST).trim() || DEFAULT_BIND_HOST;
  // Case-insensitive: a benign spelling variant (e.g. "LOCALHOST") is still
  // loopback intent and must not hit the same hard-refusal path as a genuine
  // non-loopback host. The original `host` (not lowercased) is what actually
  // gets bound below, so this only relaxes the *check*.
  if (!LOOPBACK_HOSTS.has(host.toLowerCase())) {
    fatalExit(
      'Non-loopback HTTP bind refused',
      new Error(
        `WORKRAIL_HTTP_HOST=${host} would bind the MCP transport beyond loopback. ` +
        `The endpoint has no authentication; any host that can reach this port ` +
        `could call MCP tools as you. Set WORKRAIL_HTTP_HOST=127.0.0.1 (default) ` +
        `unless you have an external authentication layer in front.`
      ),
      'config',
    );
    // fatalExit() calls process.exit(1); this return only matters if fatalExit()
    // no-oped because its re-entrancy guard was already tripped by an earlier
    // fatal condition in this process — without it we'd fall through and bind
    // anyway on a host we just refused.
    return;
  }

  const { server, ctx } = await composeServer();

  // Scan from the requested port up to HTTP_PORT_SCAN_END so a second
  // concurrent WorkRail instance can bind to a different port rather than
  // failing hard. createHttpListener() itself stays fail-fast; the scan
  // policy lives here at the transport entry point where it belongs.
  const scanEnd = Math.max(port, HTTP_PORT_SCAN_END);
  const listener = await bindWithPortFallback(port, scanEnd, host);

  // Register graceful shutdown so that fatalExit() stops the MCP HTTP listener
  // cleanly before calling process.exit(1). The 3s timeout guarantees exit within a bounded window.
  registerGracefulShutdown(async () => {
    await listener.stop();
  });

  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true, // Simple request/response, not SSE streaming
  });

  // -------------------------------------------------------------------------
  // Mount MCP protocol handlers at /mcp
  // -------------------------------------------------------------------------
  // The SDK's handleRequest takes (req, res, parsedBody).
  // Express body-parser makes the parsed body available on req.body.
  // Routes are registered on the Express app after the port is bound.
  // Express dispatches by app-level routing, not by listen order, so
  // registering routes on an already-started server is safe.
  listener.app.use(express.json());
  listener.app.post('/mcp', (req, res) => transport.handleRequest(req, res, req.body));
  listener.app.get('/mcp', (req, res) => transport.handleRequest(req, res));
  listener.app.delete('/mcp', (req, res) => transport.handleRequest(req, res));

  await server.connect(transport);

  // Health endpoint — registered AFTER server.connect() so it only becomes
  // available once the MCP transport is fully ready.
  listener.app.get('/workrail-health', (_req, res) => {
    res.json({ service: 'workrail', pid: process.pid });
  });

  const boundPort = listener.getBoundPort();
  console.error('[Transport] WorkRail MCP Server running on HTTP');
  console.error(`[Transport] MCP endpoint: http://${host}:${boundPort}/mcp`);

  // -------------------------------------------------------------------------
  // HTTP mode: no workspace roots
  // Bot services pass explicit workspacePath on start_workflow.
  // The existing fallback chain (workspacePath > MCP roots > server CWD)
  // handles this correctly.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Shutdown hooks (shared)
  // -------------------------------------------------------------------------
  wireShutdownHooks({
    onBeforeTerminate: async () => {
      await listener.stop();
    },
  });
}
