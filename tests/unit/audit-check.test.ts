import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALLOWLIST,
  describeAuditJsonShapeError,
  evaluate,
  extractGhsaId,
  isAuditJson,
  isDirectExecutionEntry,
  isVendoredNpmPath,
  loadAndEvaluate,
  obtainAuditJsonText,
  resolveVia,
  type AuditFinding,
  type AuditJson,
} from '../../scripts/audit-check.ts';
import {
  KNOWN_GOOD_DEV_TOOLING_NO_FIX_PATHS,
  REAL_AUDIT_JSON_CURRENT,
  REAL_AUDIT_JSON_WITH_BRACES_CHAIN,
} from './fixtures/audit-check.fixture.ts';

function auditJson(vulnerabilities: Record<string, AuditFinding>): AuditJson {
  return {
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
    vulnerabilities,
  };
}

const ALLOWLISTED_BRACE_EXPANSION = ALLOWLIST.find((e) => e.packageName === 'brace-expansion')!;
const ALLOWLISTED_UNDICI = ALLOWLIST.find((e) => e.packageName === 'undici')!;

describe('audit-check: evaluate()', () => {
  it('passes on a clean audit with no vulnerabilities at all (the exit-0 case)', () => {
    expect(evaluate(auditJson({}))).toEqual({ kind: 'pass' });
  });

  it('passes against the real, captured current audit shape (fixture-locked schema test)', () => {
    expect(evaluate(REAL_AUDIT_JSON_CURRENT)).toEqual({ kind: 'pass' });
  });

  it('passes when every high/critical via entry is allowlisted and vendored', () => {
    const result = evaluate(
      auditJson({
        'brace-expansion': {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/brace-expansion'],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_BRACE_EXPANSION.advisoryId}` }],
        },
      }),
    );
    expect(result).toEqual({ kind: 'pass' });
  });

  it('fails on a high-severity finding whose advisory id is not in the allowlist', () => {
    const result = evaluate(
      auditJson({
        'some-new-package': {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/some-new-package'],
          via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-0000-0000-0000' }],
        },
      }),
    );
    expect(result.kind).toBe('fail');
  });

  it('fails on an empty nodes array instead of vacuously passing the path-prefix check', () => {
    const result = evaluate(
      auditJson({
        undici: {
          severity: 'high',
          nodes: [],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_UNDICI.advisoryId}` }],
        },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/no install paths/);
  });

  it('fails closed when a via entry is a bare string, even for an otherwise-allowlisted package', () => {
    const result = evaluate(
      auditJson({
        undici: {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/undici'],
          via: ['some-upstream-package'],
        },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/bare dependency-name reference/);
  });

  it('fails when the same allowlisted advisory affects a non-vendored install path (collision guard)', () => {
    const result = evaluate(
      auditJson({
        undici: {
          severity: 'high',
          // "npmx" must not match the "node_modules/npm/" prefix.
          nodes: ['node_modules/npmx/node_modules/undici'],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_UNDICI.advisoryId}` }],
        },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/non-vendored install path/);
  });

  it('fails when an allowlisted advisory has even one additional, non-vendored node alongside a vendored one', () => {
    const result = evaluate(
      auditJson({
        undici: {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/undici', 'node_modules/undici'],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_UNDICI.advisoryId}` }],
        },
      }),
    );
    expect(result.kind).toBe('fail');
  });

  it('ignores a low/moderate via entry on an otherwise-allowlisted high-severity finding', () => {
    const result = evaluate(
      auditJson({
        'brace-expansion': {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/brace-expansion'],
          via: [
            { severity: 'moderate', url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr' },
            { severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_BRACE_EXPANSION.advisoryId}` },
          ],
        },
      }),
    );
    expect(result).toEqual({ kind: 'pass' });
  });
});

describe('audit-check: evaluate() -- bare-via chain resolution (issue #54)', () => {
  it('collects a direct advisory even when a sibling via entry is a cyclic back-reference', () => {
    const result = evaluate(
      auditJson({
        mid: {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/mid'],
          via: ['cyclic-peer', 'brace-expansion'],
        },
        'cyclic-peer': {
          severity: 'high',
          nodes: ['node_modules/cyclic-peer'],
          via: ['mid'],
        },
        'brace-expansion': {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/brace-expansion'],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_BRACE_EXPANSION.advisoryId}` }],
        },
      }),
    );
    expect(result).toEqual({ kind: 'pass' });
  });

  it('does not let one allowlisted-resolvable via branch silently clear a distinct, non-allowlisted advisory on a sibling branch', () => {
    const result = evaluate(
      auditJson({
        dual: {
          severity: 'high',
          nodes: ['node_modules/dual'],
          via: ['undici', 'bad-leaf'],
        },
        undici: {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/undici'],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_UNDICI.advisoryId}` }],
        },
        'bad-leaf': {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/bad-leaf'],
          via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-0000-0000-0001' }],
        },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/GHSA-0000-0000-0001.*not in the allowlist/);
  });

  it('fails closed on a malformed via entry shape at the top level', () => {
    const malformed = {
      severity: 'high',
      nodes: ['node_modules/some-pkg'],
      via: [{ notSeverityOrUrl: true }],
    } as unknown as AuditFinding;
    const result = evaluate(auditJson({ 'some-pkg': malformed }));
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/unrecognized shape/);
  });

  it('fails closed on a malformed via entry shape reached through chain resolution', () => {
    const result = evaluate(
      auditJson({
        outer: { severity: 'high', nodes: ['node_modules/outer'], via: ['chained-malformed'] },
        'chained-malformed': {
          severity: 'high',
          nodes: ['node_modules/chained-malformed'],
          via: [{ notSeverityOrUrl: true }] as unknown as AuditFinding['via'],
        },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/bare dependency-name reference/);
  });

  it('fails closed when a resolved package has a genuinely empty via array', () => {
    const result = evaluate(
      auditJson({
        outer: { severity: 'high', nodes: ['node_modules/outer'], via: ['empty-leaf'] },
        'empty-leaf': { severity: 'high', nodes: ['node_modules/empty-leaf'], via: [] },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/bare dependency-name reference/);
  });

  it('resolves two independent top-level packages into the same shared leaf without a false cycle (diamond shape)', () => {
    const result = evaluate(
      auditJson({
        'diamond-a': { severity: 'high', nodes: ['node_modules/diamond-a'], via: ['brace-expansion'] },
        'diamond-b': { severity: 'high', nodes: ['node_modules/diamond-b'], via: ['brace-expansion'] },
        'brace-expansion': {
          severity: 'high',
          nodes: ['node_modules/npm/node_modules/brace-expansion'],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_BRACE_EXPANSION.advisoryId}` }],
        },
      }),
    );
    expect(result).toEqual({ kind: 'pass' });
  });

  it('still requires a vendored install path for a vendored-npm-bundle entry reached via chain resolution', () => {
    const result = evaluate(
      auditJson({
        outer: { severity: 'high', nodes: ['node_modules/outer'], via: ['undici'] },
        undici: {
          severity: 'high',
          nodes: ['node_modules/undici'],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_UNDICI.advisoryId}` }],
        },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/non-vendored install path/);
  });

  it('fails closed on a pure cycle with no real advisory reachable through any branch', () => {
    const result = evaluate(
      auditJson({
        mid: { severity: 'high', nodes: ['node_modules/mid'], via: ['cyclic-peer'] },
        'cyclic-peer': { severity: 'high', nodes: ['node_modules/cyclic-peer'], via: ['mid'] },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/never resolved to any checkable advisory/);
  });

  it('fails closed on a high/critical package with a genuinely empty top-level via array', () => {
    const result = evaluate(auditJson({ 'no-via': { severity: 'high', nodes: ['node_modules/no-via'], via: [] } }));
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/no "via" entries listed/);
  });

  it('does not emit a redundant "never resolved" reason alongside a more specific unresolvable-chain reason', () => {
    const result = evaluate(
      auditJson({ outer: { severity: 'high', nodes: ['node_modules/outer'], via: ['totally-unknown-package'] } }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons).toHaveLength(1);
    expect(result.kind === 'fail' && result.reasons[0]).toMatch(/bare dependency-name reference/);
  });

  it('fails closed when a chain-resolved advisory has an empty nodes array (not just the top-level package)', () => {
    const result = evaluate(
      auditJson({
        outer: { severity: 'high', nodes: ['node_modules/outer'], via: ['undici'] },
        undici: {
          severity: 'high',
          nodes: [],
          via: [{ severity: 'high', url: `https://github.com/advisories/${ALLOWLISTED_UNDICI.advisoryId}` }],
        },
      }),
    );
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.reasons.join()).toMatch(/no install paths listed/);
  });
});

describe('audit-check: resolveVia() (direct unit tests)', () => {
  it('resolves a bare name to its real advisory objects', () => {
    const result = resolveVia(
      'leaf',
      { leaf: { severity: 'high', nodes: ['node_modules/leaf'], via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] } },
      new Set(),
    );
    expect(result).toEqual({
      kind: 'resolved',
      advisories: [{ advisoryId: 'GHSA-aaaa-bbbb-cccc', packageName: 'leaf', nodes: ['node_modules/leaf'] }],
    });
  });

  it('folds a cycle to a resolved-but-empty result rather than a failure', () => {
    const vulnerabilities: Record<string, AuditFinding> = {
      a: { severity: 'high', nodes: ['node_modules/a'], via: ['b'] },
      b: { severity: 'high', nodes: ['node_modules/b'], via: ['a'] },
    };
    const result = resolveVia('b', vulnerabilities, new Set(['a']));
    expect(result).toEqual({ kind: 'resolved', advisories: [] });
  });

  it('returns unresolvable for a name absent from the vulnerabilities map', () => {
    expect(resolveVia('does-not-exist', {}, new Set())).toEqual({ kind: 'unresolvable', packageName: 'does-not-exist' });
  });

  it('returns unresolvable for a package with an empty via array', () => {
    const vulnerabilities: Record<string, AuditFinding> = { empty: { severity: 'high', nodes: ['node_modules/empty'], via: [] } };
    expect(resolveVia('empty', vulnerabilities, new Set())).toEqual({ kind: 'unresolvable', packageName: 'empty' });
  });

  it('returns unresolvable for a malformed via entry shape', () => {
    const vulnerabilities = {
      malformed: { severity: 'high', nodes: ['node_modules/malformed'], via: [{ nope: true }] },
    } as unknown as Record<string, AuditFinding>;
    expect(resolveVia('malformed', vulnerabilities, new Set())).toEqual({
      kind: 'unresolvable',
      packageName: 'malformed',
    });
  });
});

describe('audit-check: evaluate() -- real issue #54 fixture (braces/tinypool chain)', () => {
  it('passes end-to-end against the real captured braces/http-cache-semantics/tinypool chain shape', () => {
    expect(evaluate(REAL_AUDIT_JSON_WITH_BRACES_CHAIN)).toEqual({ kind: 'pass' });
  });

  it('pins today\'s known-good install paths for every dev-tooling-no-fix entry (regression guard)', () => {
    for (const [packageName, expectedNodes] of Object.entries(KNOWN_GOOD_DEV_TOOLING_NO_FIX_PATHS)) {
      const finding = REAL_AUDIT_JSON_WITH_BRACES_CHAIN.vulnerabilities[packageName];
      expect(finding, `expected a "${packageName}" entry in the fixture`).toBeDefined();
      expect(finding!.nodes).toEqual(expectedNodes);
    }
  });
});

describe('audit-check: ALLOWLIST dated-justification invariant (AC-4)', () => {
  it('every allowlist entry has a non-empty addedOn, reviewBy, and reason', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.addedOn.length, `${entry.packageName} (${entry.advisoryId}): addedOn`).toBeGreaterThan(0);
      expect(entry.reviewBy.length, `${entry.packageName} (${entry.advisoryId}): reviewBy`).toBeGreaterThan(0);
      expect(entry.reason.length, `${entry.packageName} (${entry.advisoryId}): reason`).toBeGreaterThan(0);
    }
  });
});

describe('audit-check: isAuditJson() runtime type-guard', () => {
  it('rejects non-object values', () => {
    expect(isAuditJson(null)).toBe(false);
    expect(isAuditJson('not an object')).toBe(false);
    expect(isAuditJson(42)).toBe(false);
    expect(isAuditJson(undefined)).toBe(false);
  });

  it('rejects an object missing vulnerabilities', () => {
    expect(isAuditJson({ metadata: { vulnerabilities: {} } })).toBe(false);
  });

  it('rejects an object missing metadata', () => {
    expect(isAuditJson({ vulnerabilities: {} })).toBe(false);
  });

  it('rejects an object whose metadata.vulnerabilities is not an object', () => {
    expect(isAuditJson({ vulnerabilities: {}, metadata: { vulnerabilities: 'not an object' } })).toBe(false);
  });

  it('accepts the real captured audit shape', () => {
    expect(isAuditJson(REAL_AUDIT_JSON_CURRENT)).toBe(true);
  });
});

describe('audit-check: extractGhsaId()', () => {
  it('extracts the GHSA id from a real advisory URL', () => {
    expect(extractGhsaId('https://github.com/advisories/GHSA-qhr7-859c-m2p7')).toBe('GHSA-qhr7-859c-m2p7');
  });

  it('returns null for a URL with no GHSA id', () => {
    expect(extractGhsaId('https://github.com/advisories/not-a-ghsa-id')).toBeNull();
  });
});

describe('audit-check: isVendoredNpmPath() path normalization', () => {
  it('matches a plain vendored path', () => {
    expect(isVendoredNpmPath('node_modules/npm/node_modules/undici')).toBe(true);
  });

  it('matches regardless of a trailing slash', () => {
    expect(isVendoredNpmPath('node_modules/npm/node_modules/undici/')).toBe(true);
  });

  it('rejects a package name that merely starts with "npm" (collision guard)', () => {
    expect(isVendoredNpmPath('node_modules/npmx/node_modules/undici')).toBe(false);
  });

  it('rejects an unrelated top-level path', () => {
    expect(isVendoredNpmPath('node_modules/undici')).toBe(false);
  });
});

describe('audit-check: describeAuditJsonShapeError() field-level messages', () => {
  it('names the actual type when given a non-object', () => {
    expect(describeAuditJsonShapeError('not an object')).toMatch(/expected an object, got string/);
  });

  it('names "vulnerabilities" specifically when it is missing', () => {
    expect(describeAuditJsonShapeError({ metadata: { vulnerabilities: {} } })).toMatch(/"vulnerabilities"/);
  });

  it('names "metadata" specifically when it is missing', () => {
    expect(describeAuditJsonShapeError({ vulnerabilities: {} })).toMatch(/"metadata"/);
  });

  it('names "metadata.vulnerabilities" specifically when it is the wrong type', () => {
    expect(describeAuditJsonShapeError({ vulnerabilities: {}, metadata: { vulnerabilities: 'nope' } })).toMatch(
      /"metadata\.vulnerabilities"/,
    );
  });

  it('returns null for a valid shape', () => {
    expect(describeAuditJsonShapeError(REAL_AUDIT_JSON_CURRENT)).toBeNull();
  });
});

describe('audit-check: isDirectExecutionEntry() -- regression test for the percent-encoding bug', () => {
  it('matches when argv[1] and import.meta.url refer to the same plain path', () => {
    const argv1 = '/repo/scripts/audit-check.ts';
    expect(isDirectExecutionEntry(argv1, pathToFileURL(argv1).href)).toBe(true);
  });

  it('matches when the path contains a space -- this exact case silently failed before the fix', () => {
    const argv1 = '/Users/someone/claude projects/workrail/scripts/audit-check.ts';
    expect(isDirectExecutionEntry(argv1, pathToFileURL(argv1).href)).toBe(true);
  });

  it('does NOT match a naive, unencoded file:// concatenation for a path with a space', () => {
    const argv1 = '/Users/someone/claude projects/workrail/scripts/audit-check.ts';
    // Built via string concatenation, not a template literal -- this repo's own
    // test-platform-guard codemod bans that template form in tests/, so the
    // intentionally-naive comparison below (the exact bug this guards against)
    // is written this way on purpose, not as an oversight.
    const naiveUrl = 'file://' + argv1;
    expect(pathToFileURL(argv1).href).not.toBe(naiveUrl);
  });

  it('does not match when argv[1] is undefined (e.g. a REPL or unusual invocation)', () => {
    expect(isDirectExecutionEntry(undefined, pathToFileURL('/repo/scripts/audit-check.ts').href)).toBe(false);
  });

  it('does not match an unrelated module url', () => {
    const argv1 = '/repo/scripts/audit-check.ts';
    expect(isDirectExecutionEntry(argv1, pathToFileURL('/repo/scripts/some-other-file.ts').href)).toBe(false);
  });
});

describe('audit-check: obtainAuditJsonText() / loadAndEvaluate() I/O-boundary discrimination', () => {
  it('treats a clean exit (no throw) as usable output', () => {
    const runner = () => JSON.stringify(REAL_AUDIT_JSON_CURRENT);
    expect(obtainAuditJsonText(runner)).toEqual({ ok: true, text: JSON.stringify(REAL_AUDIT_JSON_CURRENT) });
  });

  it('treats exit 1 with non-empty stdout as the normal "findings exist" case, not a failure', () => {
    const runner = (): string => {
      throw { status: 1, signal: null, stdout: JSON.stringify(REAL_AUDIT_JSON_CURRENT), message: 'Command failed' };
    };
    expect(obtainAuditJsonText(runner)).toEqual({ ok: true, text: JSON.stringify(REAL_AUDIT_JSON_CURRENT) });
  });

  it('fails closed on a non-1 exit status', () => {
    const runner = (): string => {
      throw { status: 127, signal: null, stdout: '', message: 'npm: command not found' };
    };
    const result = obtainAuditJsonText(runner);
    expect(result.ok).toBe(false);
  });

  it('fails closed when killed by a signal (e.g. the configured timeout), even though status is null', () => {
    const runner = (): string => {
      throw { status: null, signal: 'SIGTERM', stdout: '', message: 'Command timed out' };
    };
    const result = obtainAuditJsonText(runner);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/SIGTERM/);
  });

  it('fails closed on exit 1 with empty stdout', () => {
    const runner = (): string => {
      throw { status: 1, signal: null, stdout: '', message: 'Command failed' };
    };
    expect(obtainAuditJsonText(runner).ok).toBe(false);
  });

  it('loadAndEvaluate() passes end-to-end through an injected runner when only allowlisted findings exist', () => {
    const runner = () => JSON.stringify(REAL_AUDIT_JSON_CURRENT);
    expect(loadAndEvaluate(runner)).toEqual({ kind: 'pass' });
  });

  it('loadAndEvaluate() fails end-to-end on malformed JSON from the runner', () => {
    const runner = () => 'not valid json{{{';
    expect(loadAndEvaluate(runner).kind).toBe('fail');
  });

  it('loadAndEvaluate() fails end-to-end when the runner throws a boundary error', () => {
    const runner = (): string => {
      throw { status: null, signal: 'SIGTERM', stdout: '', message: 'timed out' };
    };
    expect(loadAndEvaluate(runner).kind).toBe('fail');
  });
});
