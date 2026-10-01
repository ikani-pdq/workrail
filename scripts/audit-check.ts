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
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED_NPM_PREFIX = 'node_modules/npm/';

type ViaObject = {
  url: string;
  severity: string;
};
type Via = string | ViaObject;

type AuditFinding = {
  severity: string;
  via: Via[];
  nodes: string[];
};

type AuditJson = {
  metadata: { vulnerabilities: Record<string, number> };
  vulnerabilities: Record<string, AuditFinding>;
};

type AllowlistEntry = {
  advisoryId: string;
  packageName: string;
  reason: string;
  addedOn: string;
  reviewBy: string;
};

type AuditResult = { kind: 'pass' } | { kind: 'fail'; reasons: string[] };

// Each entry is one (advisoryId, packageName) pair -- a finding is only ever
// exempted if its advisory AND package match an entry here, AND every
// affected install path is under node_modules/npm/ (see isVendoredNpmPath).
const ALLOWLIST: AllowlistEntry[] = [
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

function normalizeNodePath(nodePath: string): string {
  return nodePath.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
}

function isVendoredNpmPath(nodePath: string): boolean {
  return normalizeNodePath(nodePath).startsWith(VENDORED_NPM_PREFIX);
}

function extractGhsaId(url: string): string | null {
  const match = /\/(GHSA-[A-Za-z0-9-]+)$/.exec(url);
  return match ? match[1] : null;
}

function isAllowlisted(advisoryId: string, packageName: string): boolean {
  return ALLOWLIST.some((entry) => entry.advisoryId === advisoryId && entry.packageName === packageName);
}

function isHighOrCritical(severity: string): boolean {
  return severity === 'high' || severity === 'critical';
}

function isAuditJson(value: unknown): value is AuditJson {
  if (typeof value !== 'object' || value === null) return false;
  const root = value as Record<string, unknown>;
  if (typeof root.vulnerabilities !== 'object' || root.vulnerabilities === null) return false;
  if (typeof root.metadata !== 'object' || root.metadata === null) return false;
  const metadata = root.metadata as Record<string, unknown>;
  return typeof metadata.vulnerabilities === 'object' && metadata.vulnerabilities !== null;
}

function evaluate(audit: AuditJson): AuditResult {
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

function obtainAuditJsonText(): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    const text = execFileSync('npm', ['audit', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { ok: true, text };
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

function loadAndEvaluate(): AuditResult {
  const obtained = obtainAuditJsonText();
  if (!obtained.ok) {
    return { kind: 'fail', reasons: [obtained.reason] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(obtained.text);
  } catch (error) {
    return { kind: 'fail', reasons: [`npm audit output was not valid JSON: ${(error as Error).message}`] };
  }

  if (!isAuditJson(parsed)) {
    return { kind: 'fail', reasons: ['npm audit --json output did not match the expected shape'] };
  }

  return evaluate(parsed);
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

main();
