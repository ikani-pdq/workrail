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

// Trimmed to the fields audit-check.ts actually reads -- captured from a real
// `npm audit --json` run against this repo's dependency tree while fixing
// issue #54 (2026-10-06). Covers the real multi-hop bare-via chain: braces's
// single real advisory (GHSA-vfj7-8cjw-p6xm, not vendored, no upstream fix)
// fans out through chokidar/micromatch/nodemon and the entire
// @semantic-release/* plugin family -- including several genuine
// self-referencing cycles among the plugins, with no real advisory reachable
// through those specific branches -- down to a single shared root cause.
// Also covers the two 'dev-tooling-no-fix' entries added for issue #54
// (braces, tinypool) and reconfirms the original 3 (+1) vendored-npm-bundle
// entries are unaffected by any of the new chain-resolution logic.
export const REAL_AUDIT_JSON_WITH_BRACES_CHAIN: AuditJson = {
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 15, critical: 1, total: 16 } },
  vulnerabilities: {
    '@semantic-release/changelog': {
      severity: 'high',
      nodes: ['node_modules/@semantic-release/changelog'],
      via: ['semantic-release'],
    },
    '@semantic-release/commit-analyzer': {
      severity: 'high',
      nodes: ['node_modules/@semantic-release/commit-analyzer'],
      via: ['micromatch', 'semantic-release'],
    },
    '@semantic-release/exec': {
      severity: 'high',
      nodes: ['node_modules/@semantic-release/exec'],
      via: ['semantic-release'],
    },
    '@semantic-release/git': {
      severity: 'high',
      nodes: ['node_modules/@semantic-release/git'],
      via: ['micromatch', 'semantic-release'],
    },
    '@semantic-release/github': {
      severity: 'high',
      nodes: ['node_modules/@semantic-release/github'],
      via: ['semantic-release'],
    },
    '@semantic-release/npm': {
      severity: 'high',
      nodes: ['node_modules/@semantic-release/npm'],
      via: ['semantic-release'],
    },
    '@semantic-release/release-notes-generator': {
      severity: 'high',
      nodes: ['node_modules/@semantic-release/release-notes-generator'],
      via: ['semantic-release'],
    },
    braces: {
      severity: 'high',
      nodes: ['node_modules/braces'],
      via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }],
    },
    chokidar: {
      severity: 'high',
      nodes: ['node_modules/chokidar'],
      via: ['braces'],
    },
    micromatch: {
      severity: 'high',
      nodes: ['node_modules/micromatch'],
      via: ['braces'],
    },
    nodemon: {
      severity: 'high',
      nodes: ['node_modules/nodemon'],
      via: ['chokidar'],
    },
    'semantic-release': {
      severity: 'high',
      nodes: ['node_modules/semantic-release'],
      via: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/github',
        '@semantic-release/npm',
        '@semantic-release/release-notes-generator',
        'micromatch',
      ],
    },
    'http-cache-semantics': {
      severity: 'high',
      nodes: ['node_modules/npm/node_modules/http-cache-semantics'],
      via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-ch52-4w7c-c8xp' }],
    },
    tinypool: {
      severity: 'critical',
      nodes: ['node_modules/tinypool'],
      via: [
        { severity: 'critical', url: 'https://github.com/advisories/GHSA-5gmw-xhrv-c9v3' },
        { severity: 'critical', url: 'https://github.com/advisories/GHSA-85c8-ppgw-ccpr' },
      ],
    },
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
  },
};

// The exact install paths the 'dev-tooling-no-fix' entries' safety claim
// depends on, as of 2026-10-06 -- pinned so a future lockfile shift that
// moves either package onto a different (potentially production-reachable)
// path breaks this test instead of silently continuing to pass. Partial
// mitigation only: 'dev-tooling-no-fix', unlike 'vendored-npm-bundle', has no
// invariant actually re-checked at runtime by evaluate() -- this just pins
// today's known-good shape so drift is caught here instead of silently.
export const KNOWN_GOOD_DEV_TOOLING_NO_FIX_PATHS: Record<string, string[]> = {
  braces: ['node_modules/braces'],
  chokidar: ['node_modules/chokidar'],
  micromatch: ['node_modules/micromatch'],
  nodemon: ['node_modules/nodemon'],
  tinypool: ['node_modules/tinypool'],
};
