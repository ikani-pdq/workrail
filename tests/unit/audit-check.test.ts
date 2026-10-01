import { describe, expect, it } from 'vitest';
import {
  ALLOWLIST,
  evaluate,
  extractGhsaId,
  isAuditJson,
  isVendoredNpmPath,
  type AuditFinding,
  type AuditJson,
} from '../../scripts/audit-check.ts';
import { REAL_AUDIT_JSON_CURRENT } from './fixtures/audit-check.fixture.ts';

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
