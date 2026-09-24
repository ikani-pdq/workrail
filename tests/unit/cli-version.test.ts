import { describe, it, expect, vi } from 'vitest';
import { executeVersionCommand } from '../../src/cli/commands/version.js';

describe('executeVersionCommand', () => {
  it('prints WorkRail v<version> and returns success', () => {
    const printed: string[] = [];
    const result = executeVersionCommand({
      getVersion: () => '3.16.0',
      print: (msg) => printed.push(msg),
    });

    expect(result.kind).toBe('success');
    expect(printed).toEqual(['WorkRail v3.16.0']);
  });

  it('returns failure when getVersion throws', () => {
    const result = executeVersionCommand({
      getVersion: () => { throw new Error('file not found'); },
      print: vi.fn(),
    });

    expect(result.kind).toBe('failure');
    if (result.kind === 'failure') {
      expect(result.output.message).toContain('file not found');
    }
  });

  it('does not call print on failure', () => {
    const print = vi.fn();
    executeVersionCommand({
      getVersion: () => { throw new Error('boom'); },
      print,
    });

    expect(print).not.toHaveBeenCalled();
  });
});

describe('workrail version CLI integration', () => {
  it('outputs WorkRail v<version> to stdout with exit code 0', () => {
    const { execFileSync } = require('child_process');
    const path = require('path');
    const cliPath = path.join(__dirname, '../../dist/cli.js');

    // execFileSync, not execSync: the latter goes through a shell, so a
    // checkout path containing a space splits into two arguments and node
    // fails with MODULE_NOT_FOUND on the truncated path.
    let output: string;
    try {
      output = execFileSync('node', [cliPath, 'version'], { encoding: 'utf-8' });
    } catch (err: any) {
      throw new Error(`CLI exited with non-zero code: ${err.message}`);
    }

    expect(output.trim()).toMatch(/^WorkRail v\d+\.\d+\.\d+/);
  });
});

/**
 * These exercise the binaries `package.json` actually points `bin` at.
 *
 * The suite above targets `dist/cli.js`, which has no `bin` entry -- so
 * every shipped version surface was previously untested. That matters
 * especially for `workrail`, where an unrecognised argument falls through
 * to the MCP server: a regression does not fail loudly, it hangs on a stdio
 * handshake. Each case therefore asserts on output AND is bounded by a
 * timeout with stdin closed, so a fall-through fails the test instead of
 * stalling the run.
 */
describe('shipped binaries: every version spelling', () => {
  const { execFileSync } = require('child_process');
  const path = require('path');

  const run = (bin: string, arg: string): string =>
    execFileSync('node', [path.join(__dirname, '../../dist', bin), arg], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });

  describe.each([
    ['cli-workrail.js', ['--version', '-v', '-V', 'version']],
    ['cli-worktrain.js', ['--version', '-v', '-V']],
  ])('%s', (bin, args) => {
    it.each(args)('%s prints the version and exits 0', (arg) => {
      const output = run(bin, arg);
      expect(output.trim()).toMatch(/^WorkRail v\d+\.\d+\.\d+/);
    });
  });

  it('never starts an MCP server for a version request', () => {
    // The original #40 bug: `workrail --version` emitted a [Startup] line and
    // blocked. Any spelling that regresses into the fall-through reintroduces it.
    for (const arg of ['--version', '-v', '-V', 'version']) {
      expect(run('cli-workrail.js', arg)).not.toContain('[Startup]');
    }
  });

  it('both binaries report the identical string for the same build', () => {
    expect(run('cli-worktrain.js', '--version')).toBe(run('cli-workrail.js', '--version'));
  });
});
