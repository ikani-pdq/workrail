/**
 * Shared handling for "what version is this?" across both binaries.
 *
 * WHY this is not left to commander's `.version()`: commander accepts exactly
 * one short flag, so `-v, -V, --version` fails at definition time. The two
 * CLIs previously ended up disagreeing as a result -- `-v` printed on
 * `workrail` and errored on `worktrain`, while `-V` printed on `worktrain`
 * and started a stdio MCP server on `workrail`. Recognising the request from
 * argv ourselves, before any parser or server dispatch runs, is what lets
 * every spelling behave identically on both binaries.
 *
 * WHY it runs first: on `workrail`, an unrecognised argument falls through to
 * the MCP server, so any spelling this module does not claim becomes a server
 * that blocks on a stdio handshake instead of printing a version.
 */

import { executeVersionCommand } from './commands/version.js';
import { failure } from './types/cli-result.js';
import { interpretCliResultWithoutDI } from './interpret-result.js';
import { readPackageVersion } from '../runtime/package-version.js';

/**
 * Every spelling treated as a request for the version.
 *
 * `version` is included as a bare subcommand because it is the form the
 * repository's own CLI tests use, and on `workrail` it previously started a
 * server. `-V` is commander's default short flag, kept so existing
 * `worktrain -V` callers keep working.
 */
const VERSION_REQUESTS: readonly string[] = ['--version', '-v', '-V', 'version'];

/** True when `arg` asks for the version. */
export function isVersionRequest(arg: string | undefined): boolean {
  return arg !== undefined && VERSION_REQUESTS.includes(arg);
}

/**
 * Print the version resolved from the package enclosing `startDir` and
 * terminate: exit 0 on success, exit 1 with a message on stderr when no
 * version can be resolved. Never returns.
 *
 * Both binaries route through `executeVersionCommand` so they print one
 * identical string for a given build.
 *
 * WHY it exits rather than returning: `interpretCliResultWithoutDI`
 * deliberately lets a success fall through so pending cleanup can run, which
 * is right for a command in the middle of a program but wrong here. On
 * `worktrain` the caller sits above the commander definition, so returning
 * would print the version and then let commander reject the very same flag as
 * an unknown option. Nothing is registered this early in either binary, so
 * there is no cleanup to lose.
 */
export function runVersionRequest(startDir: string): never {
  const version = readPackageVersion(startDir);

  interpretCliResultWithoutDI(
    version === null
      ? failure('Failed to read version: no readable package.json found for this install')
      : executeVersionCommand({
          getVersion: () => version,
          print: (msg) => console.log(msg),
        })
  );

  // Only reached on success -- the failure branch above exits non-zero.
  process.exit(0);
}
