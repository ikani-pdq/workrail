/**
 * Tests for the loopback-only enforcement in startHttpServer().
 *
 * WHY os.homedir() is mocked:
 * Same rationale as tests/unit/mcp/transports/fatal-exit.test.ts -- the
 * non-loopback case calls the real fatalExit(), which writes a crash-log
 * entry computed from homedir() at fatal-exit.ts's module load time. Without
 * this mock, that write would land in the ACTUAL ~/.workrail/crash.log, the
 * same file a live WorkRail bridge session watches to detect crashes.
 *
 * WHY composeServer() and wireShutdownHooks() are mocked:
 * Both pull in the full DI container / engine bootstrap, which this test has
 * no need to exercise -- it is scoped to the host-validation branch added in
 * this change, not full server composition (already covered end-to-end by
 * tests/integration/mcp-http-transport.test.ts). bindWithPortFallback() is
 * NOT mocked -- it needs no DI and is cheap/safe to run for real, matching
 * tests/unit/mcp/http-listener.test.ts's own approach.
 *
 * WHY uncaughtException/unhandledRejection listeners are snapshotted:
 * registerFatalHandlers() (called at the top of startHttpServer on every
 * invocation) attaches global process.on(...) handlers. This file calls
 * startHttpServer() three times (once per test case, each via a fresh
 * vi.resetModules() + dynamic import), which would otherwise accumulate
 * listeners on the real shared `process` object across the file's run.
 * Snapshotting and restoring the exact pre-test listener set avoids that
 * without clobbering unrelated listeners from other code.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tmpHome: string;

vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof os>();
  return {
    ...original,
    homedir: () => tmpHome ?? original.homedir(),
  };
});

vi.mock('../../../src/mcp/server.js', () => ({
  composeServer: vi.fn(async () => ({
    server: { connect: vi.fn(async () => undefined) },
    ctx: {},
  })),
}));

vi.mock('../../../src/mcp/transports/shutdown-hooks.js', () => ({
  wireShutdownHooks: vi.fn(),
}));

describe('startHttpServer loopback enforcement', () => {
  let originalHost: string | undefined;
  let uncaughtBefore: NodeJS.UncaughtExceptionListener[];
  let unhandledBefore: NodeJS.UnhandledRejectionListener[];

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'workrail-http-entry-test-'));
    originalHost = process.env.WORKRAIL_HTTP_HOST;
    delete process.env.WORKRAIL_HTTP_HOST;

    uncaughtBefore = process.listeners('uncaughtException').slice() as NodeJS.UncaughtExceptionListener[];
    unhandledBefore = process.listeners('unhandledRejection').slice() as NodeJS.UnhandledRejectionListener[];

    vi.resetModules();
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`process.exit(${code})`);
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env.WORKRAIL_HTTP_HOST;
    } else {
      process.env.WORKRAIL_HTTP_HOST = originalHost;
    }

    process.removeAllListeners('uncaughtException');
    uncaughtBefore.forEach((l) => process.on('uncaughtException', l));
    process.removeAllListeners('unhandledRejection');
    unhandledBefore.forEach((l) => process.on('unhandledRejection', l));

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('starts normally with the default loopback host (no WORKRAIL_HTTP_HOST set)', async () => {
    const { startHttpServer } = await import('../../../src/mcp/transports/http-entry.js');
    const { composeServer } = await import('../../../src/mcp/server.js');
    await expect(startHttpServer(0)).resolves.toBeUndefined();
    expect(process.exit).not.toHaveBeenCalled();
    // Pins the ordering fix: composeServer() must run on the happy path.
    expect(composeServer).toHaveBeenCalledTimes(1);
  });

  it('starts normally with an explicit loopback host', async () => {
    process.env.WORKRAIL_HTTP_HOST = '127.0.0.1';
    const { startHttpServer } = await import('../../../src/mcp/transports/http-entry.js');
    const { composeServer } = await import('../../../src/mcp/server.js');
    await expect(startHttpServer(0)).resolves.toBeUndefined();
    expect(process.exit).not.toHaveBeenCalled();
    expect(composeServer).toHaveBeenCalledTimes(1);
  });

  it('treats a case-varied loopback spelling as loopback, not a refusal', async () => {
    process.env.WORKRAIL_HTTP_HOST = 'LOCALHOST';
    const { startHttpServer } = await import('../../../src/mcp/transports/http-entry.js');
    const { composeServer } = await import('../../../src/mcp/server.js');
    await expect(startHttpServer(0)).resolves.toBeUndefined();
    expect(process.exit).not.toHaveBeenCalled();
    expect(composeServer).toHaveBeenCalledTimes(1);
  });

  it('refuses to start on a non-loopback host', async () => {
    process.env.WORKRAIL_HTTP_HOST = '0.0.0.0';
    const { startHttpServer } = await import('../../../src/mcp/transports/http-entry.js');
    const { composeServer } = await import('../../../src/mcp/server.js');
    await expect(startHttpServer(0)).rejects.toThrow('process.exit(1)');
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('WORKRAIL_HTTP_HOST=0.0.0.0'),
    );
    // Pins the ordering fix: composeServer() must be skipped on a rejected host.
    expect(composeServer).not.toHaveBeenCalled();
  });
});
