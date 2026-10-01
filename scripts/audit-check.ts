#!/usr/bin/env node

/**
 * Scoped npm-audit gate for CI's `security` job.
 *
 * `npm audit --audit-level=high` fails on brace-expansion/undici advisories
 * vendored as bundleDependencies inside node_modules/npm/node_modules -- pulled
 * in transitively via semantic-release -> @semantic-release/npm -> npm, with
 * no upstream fix available (see issue #50). This wrapper fails on every
 * high/critical finding npm audit reports EXCEPT the specific, allowlisted
 * advisories that are confined entirely to vendored npm-internal install
 * paths -- any new finding, or any finding on the same package at a
 * non-vendored path, still fails the build.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED_NPM_PREFIX = 'node_modules/npm/';

export type ViaObject = {
  url: string;
  severity: string;
};
export type Via = string | ViaObject;

export type AuditFinding = {
  severity: string;
  via: Via[];
  nodes: string[];
};

export type AuditJson = {
  metadata: { vulnerabilities: Record<string, number> };
  vulnerabilities: Record<string, AuditFinding>;
};

export type AllowlistEntry = {
  advisoryId: string;
  packageName: string;
  reason: string;
  addedOn: string;
  reviewBy: string;
};

export type AuditResult = { kind: 'pass' } | { kind: 'fail'; reasons: string[] };

// Each entry is one (advisoryId, packageName) pair -- a finding is only ever
// exempted if its advisory AND package match an entry here, AND every
// affected install path is under node_modules/npm/ (see isVendoredNpmPath).
export const ALLOWLIST: AllowlistEntry[] = [
  {
    advisoryId: 'GHSA-qhr7-859c-m2p7',
    packageName: 'brace-expansion',
    reason:
      "Vendored inside npm's own bundleDependencies (semantic-release -> @semantic-release/npm -> npm). " +
      'No npm or @semantic-release/npm release fixes this as of 2026-10-01 (checked npm@12.2.0 and ' +
      '@semantic-release/npm@13.2.0 -- both still vendor the vulnerable version). See issue #50.',
    addedOn: '2026-10-01',
    reviewBy: '2026-11-01',
  },
  {
    advisoryId: 'GHSA-6j4f-fj2g-mc7p',
    packageName: 'brace-expansion',
    reason: 'Same vendored npm bundle as GHSA-qhr7-859c-m2p7 above -- see that entry and issue #50.',
    addedOn: '2026-10-01',
    reviewBy: '2026-11-01',
  },
  {
    advisoryId: 'GHSA-rfgv-xxqx-mfg5',
    packageName: 'undici',
    reason:
      "Vendored inside npm's own bundleDependencies via node-gyp (semantic-release -> @semantic-release/npm -> npm). " +
      "Not the same as this repo's other undici copies, which are normal, independently-fixable dependencies " +
      '(already patched separately). See issue #50.',
    addedOn: '2026-10-01',
    reviewBy: '2026-11-01',
  },
];

export function normalizeNodePath(nodePath: string): string {
  return nodePath.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
}

export function isVendoredNpmPath(nodePath: string): boolean {
  return normalizeNodePath(nodePath).startsWith(VENDORED_NPM_PREFIX);
}

export function extractGhsaId(url: string): string | null {
  const match = /\/(GHSA-[A-Za-z0-9-]+)$/.exec(url);
  return match ? match[1] : null;
}

function isAllowlisted(advisoryId: string, packageName: string): boolean {
  return ALLOWLIST.some((entry) => entry.advisoryId === advisoryId && entry.packageName === packageName);
}

function isHighOrCritical(severity: string): boolean {
  return severity === 'high' || severity === 'critical';
}

export function isAuditJson(value: unknown): value is AuditJson {
  return describeAuditJsonShapeError(value) === null;
}

// Separate from the isAuditJson type-guard so a real CI failure log can say
// exactly which field was wrong, instead of just "shape didn't match".
export function describeAuditJsonShapeError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return `expected an object, got ${typeof value}`;
  const root = value as Record<string, unknown>;
  if (typeof root.vulnerabilities !== 'object' || root.vulnerabilities === null) {
    return `expected "vulnerabilities" to be an object, got ${typeof root.vulnerabilities}`;
  }
  if (typeof root.metadata !== 'object' || root.metadata === null) {
    return `expected "metadata" to be an object, got ${typeof root.metadata}`;
  }
  const metadata = root.metadata as Record<string, unknown>;
  if (typeof metadata.vulnerabilities !== 'object' || metadata.vulnerabilities === null) {
    return `expected "metadata.vulnerabilities" to be an object, got ${typeof metadata.vulnerabilities}`;
  }
  return null;
}

export function evaluate(audit: AuditJson): AuditResult {
  const reasons: string[] = [];

  for (const [packageName, finding] of Object.entries(audit.vulnerabilities)) {
    if (!isHighOrCritical(finding.severity)) continue;

    const nodes = finding.nodes ?? [];
    if (nodes.length === 0) {
      reasons.push(`${packageName}: ${finding.severity} finding has no install paths listed -- failing closed`);
      continue;
    }
    const allNodesVendored = nodes.every(isVendoredNpmPath);

    for (const via of finding.via) {
      if (typeof via === 'string') {
        reasons.push(
          `${packageName}: a "via" entry is a bare dependency-name reference ("${via}"), not a direct advisory -- failing closed`,
        );
        continue;
      }
      if (!isHighOrCritical(via.severity)) continue;

      const advisoryId = extractGhsaId(via.url);
      if (!advisoryId) {
        reasons.push(`${packageName}: could not extract a GHSA id from advisory url "${via.url}" -- failing closed`);
        continue;
      }
      if (!allNodesVendored) {
        reasons.push(`${packageName} (${advisoryId}): affects a non-vendored install path (${nodes.join(', ')})`);
        continue;
      }
      if (!isAllowlisted(advisoryId, packageName)) {
        reasons.push(`${packageName} (${advisoryId}): high/critical finding is not in the allowlist`);
      }
    }
  }

  return reasons.length === 0 ? { kind: 'pass' } : { kind: 'fail', reasons };
}

// Returns npm audit's stdout text, mimicking execFileSync: returns on exit 0,
// throws (with .status/.signal/.stdout) on non-zero exit. Injectable so tests
// can exercise the exit-code/JSON-shape boundary logic below without actually
// shelling out to npm.
export type NpmAuditRunner = () => string;

function runRealNpmAudit(): string {
  return execFileSync('npm', ['audit', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

export function obtainAuditJsonText(
  runner: NpmAuditRunner = runRealNpmAudit,
): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    return { ok: true, text: runner() };
  } catch (error) {
    // npm audit exits 1 whenever any finding exists -- that is the normal case,
    // not a failure to run. Only treat it as a boundary failure if the exit
    // code/signal don't match that shape, or stdout isn't usable.
    const err = error as NodeJS.ErrnoException & { status?: number | null; signal?: string | null; stdout?: unknown };
    if (err.status === 1 && typeof err.stdout === 'string' && err.stdout.length > 0) {
      return { ok: true, text: err.stdout };
    }
    return {
      ok: false,
      reason: `npm audit did not produce usable output (status=${err.status ?? 'unknown'}, signal=${err.signal ?? 'none'}): ${err.message}`,
    };
  }
}

export function loadAndEvaluate(runner: NpmAuditRunner = runRealNpmAudit): AuditResult {
  const obtained = obtainAuditJsonText(runner);
  if (!obtained.ok) {
    return { kind: 'fail', reasons: [obtained.reason] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(obtained.text);
  } catch (error) {
    return { kind: 'fail', reasons: [`npm audit output was not valid JSON: ${(error as Error).message}`] };
  }

  const shapeError = describeAuditJsonShapeError(parsed);
  if (shapeError !== null) {
    return { kind: 'fail', reasons: [`npm audit --json output did not match the expected shape: ${shapeError}`] };
  }

  return evaluate(parsed as AuditJson);
}

function main(): void {
  const result = loadAndEvaluate();

  if (result.kind === 'pass') {
    console.log('audit-check: no disallowed high/critical findings.');
  } else {
    console.error('audit-check: failing -- disallowed finding(s) or audit-boundary error:');
    for (const reason of result.reasons) {
      console.error(`  - ${reason}`);
    }
  }

  process.exit(result.kind === 'pass' ? 0 : 1);
}

// Only run when executed directly (`node audit-check.ts`) -- importing this
// module (e.g. from a test) must not trigger a real npm audit + process.exit.
// Compares resolved file:// URLs rather than raw strings: import.meta.url is
// percent-encoded (e.g. spaces -> %20), but process.argv[1] is not, so a naive
// `file://${process.argv[1]}` comparison silently never matches on any path
// containing characters that need encoding (this repo's own checkout path
// has a space in it, which is exactly how this bug was first caught).
export function isDirectExecutionEntry(argv1: string | undefined, metaUrl: string): boolean {
  return argv1 !== undefined && metaUrl === pathToFileURL(argv1).href;
}

if (isDirectExecutionEntry(process.argv[1], import.meta.url)) {
  main();
}
