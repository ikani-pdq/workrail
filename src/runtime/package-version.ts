/**
 * Resolve an install's own version from the nearest enclosing package.json.
 *
 * WHY walk up rather than hardcode a relative path: every site that needed
 * the version used to hand-roll its own `../..` chain, and the correct depth
 * is a function of where the file happens to sit in the build output. When a
 * file's nesting and its chain disagree the lookup fails silently -- which is
 * exactly what happened in `mcp/transports/fatal-exit.ts`, whose
 * `require('../../package.json')` resolved to `dist/package.json` (a path
 * that does not exist), so every startup line logged `version=unknown`.
 * Walking up to the nearest package.json is correct from any depth, so moving
 * a file can no longer break it.
 *
 * The filesystem is injected so the walk itself is testable without touching
 * disk; `readPackageVersion` wires the real one.
 */

import fs from 'fs';
import path from 'path';

export interface PackageJsonFs {
  readonly fileExists: (filePath: string) => boolean;
  readonly readFile: (filePath: string) => string;
}

export const nodePackageJsonFs: PackageJsonFs = {
  fileExists: (filePath) => fs.existsSync(filePath),
  readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
};

/**
 * Walk up from `startDir` and return the path of the first package.json
 * found, or null if the filesystem root is reached without one.
 */
export function findNearestPackageJson(startDir: string, fs: PackageJsonFs): string | null {
  let dir = path.resolve(startDir);

  // `path.dirname` is its own fixed point at the root, which terminates the walk.
  for (;;) {
    const candidate = path.join(dir, 'package.json');
    if (fs.fileExists(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Pure: pull a usable `version` out of raw package.json text.
 * Returns null for unparseable content or a missing/non-string version.
 */
export function extractVersion(pkgJsonRaw: string): string | null {
  let parsed: { version?: unknown };
  try {
    parsed = JSON.parse(pkgJsonRaw) as typeof parsed;
  } catch {
    return null;
  }

  return typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : null;
}

/**
 * Resolve the version of the package enclosing `startDir` (normally the
 * caller's `__dirname`). Returns null rather than throwing -- callers decide
 * whether an unresolvable version is fatal or merely worth a placeholder.
 */
export function readPackageVersion(
  startDir: string,
  fs: PackageJsonFs = nodePackageJsonFs
): string | null {
  const pkgPath = findNearestPackageJson(startDir, fs);
  if (pkgPath === null) return null;

  try {
    return extractVersion(fs.readFile(pkgPath));
  } catch {
    return null;
  }
}
