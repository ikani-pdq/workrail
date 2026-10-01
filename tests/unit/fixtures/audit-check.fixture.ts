import type { AuditJson } from '../../../scripts/audit-check.ts';

// Trimmed to the fields audit-check.ts actually reads (via[].severity/url,
// nodes, metadata.vulnerabilities) -- captured from a real `npm audit --json`
// run against this repo's dependency tree after the non-force `npm audit fix`
// in #50's Slice 1. Locks in the real shape so a future npm/schema change is
// caught by a failing test instead of silently mis-parsed.
export const REAL_AUDIT_JSON_CURRENT: AuditJson = {
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 4, high: 2, critical: 0, total: 6 } },
  vulnerabilities: {
    'brace-expansion': {
      severity: 'high',
      nodes: ['node_modules/npm/node_modules/brace-expansion'],
      via: [
        { severity: 'moderate', url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr' },
        { severity: 'high', url: 'https://github.com/advisories/GHSA-qhr7-859c-m2p7' },
        { severity: 'high', url: 'https://github.com/advisories/GHSA-6j4f-fj2g-mc7p' },
      ],
    },
    undici: {
      severity: 'high',
      nodes: ['node_modules/npm/node_modules/undici'],
      via: [
        { severity: 'moderate', url: 'https://github.com/advisories/GHSA-3wwx-pv8p-q78v' },
        { severity: 'low', url: 'https://github.com/advisories/GHSA-r53p-7pc4-xj5r' },
        { severity: 'high', url: 'https://github.com/advisories/GHSA-rfgv-xxqx-mfg5' },
      ],
    },
    // Pre-existing, separately-accepted moderate findings (commit fed34033) --
    // included here because their real "via" entries are plain strings, not
    // objects, which is exactly the shape evaluate() must not choke on.
    vitest: {
      severity: 'moderate',
      nodes: ['node_modules/vitest'],
      via: ['@vitest/mocker', '@vitest/ui'],
    },
    '@vitest/ui': {
      severity: 'moderate',
      nodes: ['node_modules/@vitest/ui'],
      via: ['vitest'],
    },
  },
};
