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

// 'vendored-npm-bundle': exempted only when every affected install path is
// under node_modules/npm/ (see isVendoredNpmPath) -- the original #50/#51
// category.
// 'dev-tooling-no-fix': no upstream fix exists anywhere in the package's
// dependency chain, and the package's install paths are confirmed (by the
// author, at entry-authoring time, cited in `reason`) to be reachable only
// from devDependencies -- never a production `dependencies` edge. Unlike
// 'vendored-npm-bundle', this claim is NOT re-verified at runtime (doing so
// would require evaluate() to read package.json/the dependency tree, which
// is new I/O this module deliberately avoids to stay a pure function of
// AuditJson) -- each new addedOn/reviewBy review of a dev-tooling-no-fix
// entry must re-confirm the dev-only claim by hand.
export type AllowlistScope = 'vendored-npm-bundle' | 'dev-tooling-no-fix';

export type AllowlistEntry = {
  advisoryId: string;
  packageName: string;
  reason: string;
  addedOn: string;
  reviewBy: string;
  scope: AllowlistScope;
};

export type AuditResult = { kind: 'pass' } | { kind: 'fail'; reasons: string[] };

// Each entry is one (advisoryId, packageName) pair -- a finding is only ever
// exempted if its advisory AND package match an entry here, AND (for
// 'vendored-npm-bundle' entries) every affected install path is under
// node_modules/npm/ (see isVendoredNpmPath).
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
    scope: 'vendored-npm-bundle',
  },
  {
    advisoryId: 'GHSA-6j4f-fj2g-mc7p',
    packageName: 'brace-expansion',
    reason: 'Same vendored npm bundle as GHSA-qhr7-859c-m2p7 above -- see that entry and issue #50.',
    addedOn: '2026-10-01',
    reviewBy: '2026-11-01',
    scope: 'vendored-npm-bundle',
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
    scope: 'vendored-npm-bundle',
  },
  {
    advisoryId: 'GHSA-ch52-4w7c-c8xp',
    packageName: 'http-cache-semantics',
    reason:
      "Vendored inside npm's own bundleDependencies via make-fetch-happen (semantic-release -> " +
      '@semantic-release/npm -> npm). Same vendored-bundle shape as the brace-expansion/undici entries ' +
      'above -- see issue #50. No npm release fixes this as of 2026-10-06 (checked npm@11.21.0, still ' +
      'vendors the vulnerable version). See issue #54.',
    addedOn: '2026-10-06',
    reviewBy: '2026-11-06',
    scope: 'vendored-npm-bundle',
  },
  {
    advisoryId: 'GHSA-vfj7-8cjw-p6xm',
    packageName: 'braces',
    reason:
      'Stack-exhaustion DoS via deeply nested brace patterns. No upstream fix exists anywhere in its ' +
      'dependency chain as of 2026-10-06: braces has never published a patched release past the ' +
      'vulnerable 3.0.3 (checked `npm view braces versions`); micromatch@4.0.8 (latest) still requires ' +
      'braces@^3.0.3; chokidar@5.0.0 (latest) finally drops braces, but nodemon@3.1.14 (latest) still ' +
      'pins chokidar@^3.5.2. Confirmed reachable only from devDependencies -- never a production ' +
      "`dependencies` edge (`npm ls braces --omit=dev` returns empty). Used only by nodemon's dev " +
      "file-watcher chain and semantic-release's/micromatch's commit-message glob matching, never in " +
      'production runtime code. See issue #54.',
    addedOn: '2026-10-06',
    reviewBy: '2026-11-06',
    scope: 'dev-tooling-no-fix',
  },
  {
    advisoryId: 'GHSA-5gmw-xhrv-c9v3',
    packageName: 'tinypool',
    reason:
      'Prototype-pollution gadget in worker options leading to remote code execution (RCE class, not a ' +
      'DoS -- reviewBy set sooner than the usual ~1 month given this severity). Fix requires a major ' +
      'vitest bump (vitest@5.0.3) tracked as a follow-up, not done here. Confirmed reachable only from ' +
      'devDependencies -- never a production `dependencies` edge (`npm ls tinypool --omit=dev` returns ' +
      "empty); tinypool is only vitest's internal worker-pool implementation, never invoked outside the " +
      'test run itself. See issue #54 and the tracked vitest-v5-upgrade follow-up.',
    addedOn: '2026-10-06',
    reviewBy: '2026-10-20',
    scope: 'dev-tooling-no-fix',
  },
  {
    advisoryId: 'GHSA-85c8-ppgw-ccpr',
    packageName: 'tinypool',
    reason: 'Same RCE-class prototype-pollution gadget family as GHSA-5gmw-xhrv-c9v3 above -- see that entry.',
    addedOn: '2026-10-06',
    reviewBy: '2026-10-20',
    scope: 'dev-tooling-no-fix',
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

function findAllowlistEntry(advisoryId: string, packageName: string): AllowlistEntry | undefined {
  return ALLOWLIST.find((entry) => entry.advisoryId === advisoryId && entry.packageName === packageName);
}

function isHighOrCritical(severity: string): boolean {
  return severity === 'high' || severity === 'critical';
}

function isWellFormedViaObject(via: unknown): via is ViaObject {
  if (typeof via !== 'object' || via === null) return false;
  const candidate = via as Record<string, unknown>;
  return typeof candidate.severity === 'string' && typeof candidate.url === 'string';
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

export type ResolvedAdvisory = {
  advisoryId: string;
  packageName: string;
  nodes: string[];
};

export type ViaResolution =
  | { kind: 'resolved'; advisories: ResolvedAdvisory[] }
  | { kind: 'unresolvable'; packageName: string };

// Resolves a bare dependency-name `via` reference (npm audit's representation
// of an indirect finding) down to the real GHSA-bearing advisory object(s) it
// ultimately points to, by looking the name up in the same audit payload and
// recursing into its own `via` entries.
//
// Cycle-safety invariant this function depends on: `vulnerabilities` is an
// immutable snapshot for the lifetime of one top-level resolution call, so
// looking up the same package name twice always returns the identical `via`
// array -- a second visit can never surface information the first visit
// didn't already see. Cutting off re-traversal on `visited.has(packageName)`
// therefore only prunes redundant work; it can never hide an advisory,
// because a node's own direct (GHSA-object) `via` entries are always
// collected unconditionally when that node is first expanded, independent of
// whether a sibling `via` entry on the same node is a cyclic back-reference.
// A cycle therefore contributes zero *additional* advisories but is NOT
// itself a failure -- only a name absent from `vulnerabilities` entirely, an
// empty `via` array, or a malformed `via` entry shape is genuinely
// unresolvable and fails closed.
export function resolveVia(
  packageName: string,
  vulnerabilities: Record<string, AuditFinding>,
  visited: Set<string>,
): ViaResolution {
  if (visited.has(packageName)) {
    return { kind: 'resolved', advisories: [] };
  }

  const finding = vulnerabilities[packageName];
  if (!finding || finding.via.length === 0) {
    return { kind: 'unresolvable', packageName };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(packageName);

  const advisories: ResolvedAdvisory[] = [];
  for (const via of finding.via) {
    if (typeof via === 'string') {
      const sub = resolveVia(via, vulnerabilities, nextVisited);
      if (sub.kind === 'unresolvable') return sub;
      advisories.push(...sub.advisories);
      continue;
    }
    if (!isWellFormedViaObject(via)) {
      return { kind: 'unresolvable', packageName };
    }
    if (!isHighOrCritical(via.severity)) continue;
    const advisoryId = extractGhsaId(via.url);
    if (!advisoryId) {
      return { kind: 'unresolvable', packageName };
    }
    advisories.push({ advisoryId, packageName, nodes: finding.nodes ?? [] });
  }

  return { kind: 'resolved', advisories };
}

function describeUnreachableScope(scope: never): string {
  return `unrecognized allowlist scope "${String(scope)}" -- failing closed`;
}

// Checks one resolved advisory (whether extracted directly from a package's
// own `via` object, or surfaced via resolveVia's chain resolution) against
// the allowlist. Always appends to `reasons` on failure; never throws.
function checkAdvisoryAgainstAllowlist(adv: ResolvedAdvisory, reasons: string[]): void {
  if (adv.nodes.length === 0) {
    reasons.push(`${adv.packageName}: high/critical finding has no install paths listed -- failing closed`);
    return;
  }

  const entry = findAllowlistEntry(adv.advisoryId, adv.packageName);
  if (!entry) {
    reasons.push(`${adv.packageName} (${adv.advisoryId}): high/critical finding is not in the allowlist`);
    return;
  }

  switch (entry.scope) {
    case 'vendored-npm-bundle': {
      if (!adv.nodes.every(isVendoredNpmPath)) {
        reasons.push(
          `${adv.packageName} (${adv.advisoryId}): affects a non-vendored install path (${adv.nodes.join(', ')})`,
        );
      }
      return;
    }
    case 'dev-tooling-no-fix':
      // No upstream fix exists and the package is confirmed reachable only
      // from devDependencies (see the `scope` type's own doc comment) -- no
      // install-path requirement applies.
      return;
    default:
      reasons.push(`${adv.packageName} (${adv.advisoryId}): ${describeUnreachableScope(entry.scope)}`);
  }
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
    if (finding.via.length === 0) {
      reasons.push(`${packageName}: ${finding.severity} finding has no "via" entries listed -- failing closed`);
      continue;
    }

    // A high/critical finding must trace back to at least one real,
    // checked advisory somewhere in its via graph -- a finding whose every
    // branch bottoms out in nothing (e.g. a cycle with no other branch ever
    // contributing a real GHSA-bearing object) has no evidence backing its
    // severity at all, and must fail closed rather than silently pass. Only
    // applies when no other, more specific reason already explains the
    // failure (tracked via reasonsBeforePackage) -- avoids a redundant
    // second reason alongside e.g. an unresolvable/malformed via message.
    const reasonsBeforePackage = reasons.length;
    let anyAdvisoryChecked = false;

    for (const via of finding.via) {
      if (typeof via === 'string') {
        const resolution = resolveVia(via, audit.vulnerabilities, new Set([packageName]));
        if (resolution.kind === 'unresolvable') {
          reasons.push(
            `${packageName}: a "via" entry is a bare dependency-name reference ("${via}"), not a direct advisory -- failing closed`,
          );
          continue;
        }
        for (const adv of resolution.advisories) {
          anyAdvisoryChecked = true;
          checkAdvisoryAgainstAllowlist(adv, reasons);
        }
        continue;
      }

      if (!isWellFormedViaObject(via)) {
        reasons.push(`${packageName}: a "via" entry has an unrecognized shape -- failing closed`);
        continue;
      }
      if (!isHighOrCritical(via.severity)) continue;

      const advisoryId = extractGhsaId(via.url);
      if (!advisoryId) {
        reasons.push(`${packageName}: could not extract a GHSA id from advisory url "${via.url}" -- failing closed`);
        continue;
      }
      anyAdvisoryChecked = true;
      checkAdvisoryAgainstAllowlist({ advisoryId, packageName, nodes }, reasons);
    }

    if (!anyAdvisoryChecked && reasons.length === reasonsBeforePackage) {
      reasons.push(
        `${packageName}: ${finding.severity} finding never resolved to any checkable advisory -- failing closed`,
      );
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
// Known, accepted gap: Node resolves import.meta.url via realpath, so this
// still won't match if the script is invoked through a symlink -- not fixed,
// since neither CI nor the package.json script ever invoke it that way today.
export function isDirectExecutionEntry(argv1: string | undefined, metaUrl: string): boolean {
  return argv1 !== undefined && metaUrl === pathToFileURL(argv1).href;
}

if (isDirectExecutionEntry(process.argv[1], import.meta.url)) {
  main();
}
