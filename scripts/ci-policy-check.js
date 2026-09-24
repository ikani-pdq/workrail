#!/usr/bin/env node
/**
 * CI policy guardrails.
 *
 * This prevents accidental weakening of the CI contract that the GitHub ruleset relies on:
 * - "CI Success" must remain the stable required check name
 * - It must depend on the full required job set
 * - CI must run on push to main so release workflow_run triggers reliably
 * - No user-facing link points at the upstream project this repo was forked from
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadYaml(filePath) {
  // js-yaml is already in the dependency tree (used elsewhere). Prefer it over a brittle parser.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const yaml = require('js-yaml');
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function asStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

// =============================================================================
// Upstream-identity guard
// =============================================================================
//
// This fork periodically merges upstream (see docs/development.md and the
// pdq/merge-upstream-* branches), which is how upstream URLs get reintroduced.
// Without this check, a merge can silently restore links that send users --
// and their bug reports -- to a third party's repository. See issue #46.
//
// Matches URLs only (`github.com/<org>`), never bare package names, so the
// deliberate `@exaudeus/workrail` references naming the upstream package are
// unaffected.
const UPSTREAM_URL_PATTERN = 'github\\.com/(exaudeus|EtienneBBeaulac)';

// Places an upstream URL is legitimate.
//
// The first group is issue #46's declared non-goals -- records that state what
// was true when written, and attribution that is accurate as written.
// The second group is not from #46; each entry is listed with the reference it
// actually protects, so this list stays auditable rather than aspirational.
//
// Keep this list minimal. Every entry is a permanent directory-wide hole in the
// check, so prefer fixing a link over exempting the path that holds it.
const UPSTREAM_URL_ALLOWLIST = [
  // Issue #46 non-goals: historical records and provenance.
  'docs/adrs',
  'docs/history',
  'docs/design',
  'docs/plans',
  'design-docs',
  'docs/ideas/backlog.md',

  // Attribution: README.md:181 and :435 credit the upstream project this fork
  // is derived from, and those statements are correct as written.
  'README.md',

  // Beyond #46, each protecting a specific known reference:
  // triggers.yml is a protected file (AGENTS.md) whose commented examples
  // reference upstream; tests/unit/worktrain-trigger-test.test.ts uses an
  // upstream URL as parser fixture data.
  'triggers.yml',
  'tests/unit/worktrain-trigger-test.test.ts',

  // Two status badges whose href still names the upstream project's pre-rename
  // repo. Same shape as the two deleted from docs/reference/ in this change,
  // but docs/implementation/ is a declared non-goal of #46 -- tracked in #48.
  // Exempted by exact path, not directory, so a new upstream URL anywhere else
  // under docs/implementation/ is still caught.
  'docs/implementation/09-simple-workflow-guide.md',
  'docs/implementation/13-advanced-validation-guide.md',
];

function checkNoUpstreamLinks() {
  const args = [
    'grep', '-nE', UPSTREAM_URL_PATTERN, '--', '.',
    ...UPSTREAM_URL_ALLOWLIST.map((p) => `:!${p}`),
  ];

  // git grep exit codes: 0 = matches found, 1 = no matches, >1 = error.
  // A match is a policy violation here, so 0 is the failure case -- do not
  // collapse this into a truthiness check.
  let status;
  let stdout = '';
  try {
    stdout = execFileSync('git', args, { encoding: 'utf8' });
    status = 0;
  } catch (err) {
    status = typeof err.status === 'number' ? err.status : -1;
    stdout = err.stdout || '';
  }

  if (status === 1) return;

  if (status === 0) {
    fail(
      'CI policy violation: user-facing links point at the upstream repository.\n' +
        'Repoint them at github.com/ikani-pdq/workrail, or add the path to\n' +
        'UPSTREAM_URL_ALLOWLIST in this script if the reference is deliberate\n' +
        '(attribution, provenance, or a historical record).\n\n' +
        stdout.trimEnd()
    );
  }

  fail(`CI policy violation: upstream-link check could not run (git grep exit ${status})`);
}

function main() {
  const ciPath = path.resolve('.github/workflows/ci.yml');
  if (!fs.existsSync(ciPath)) fail(`missing CI workflow: ${ciPath}`);

  const ci = loadYaml(ciPath);

  // 1) Ensure CI triggers on push to main (required for release workflow_run)
  const on = ci.on;
  if (!on || !on.push || !Array.isArray(on.push.branches) || !on.push.branches.includes('main')) {
    fail('CI policy violation: ci.yml must trigger on push to main (on.push.branches includes "main")');
  }

  // 2) Ensure default permissions are read-only
  const permissions = ci.permissions;
  if (!permissions || permissions.contents !== 'read') {
    fail('CI policy violation: ci.yml must set permissions.contents: read');
  }

  // 3) Ensure CI Success job exists and stays stable
  const jobs = ci.jobs || {};
  const ciSuccess = jobs['ci-success'];
  if (!ciSuccess) fail('CI policy violation: missing jobs.ci-success');
  if (ciSuccess.name !== 'CI Success') {
    fail(`CI policy violation: jobs.ci-success.name must be exactly "CI Success" (got: ${String(ciSuccess.name)})`);
  }

  // 4) Ensure CI Success depends on the full required set
  const requiredNeeds = [
    'lockfile',
    'build-artifact',
    'semantic-release-dry-run',
    'typecheck',
    'validate-workflows',
    'build-and-test',
    'contract-tests',
    'e2e-tests',
  ];
  const actualNeeds = asStringArray(ciSuccess.needs);
  const missingNeeds = requiredNeeds.filter((n) => !actualNeeds.includes(n));
  if (missingNeeds.length) {
    fail(`CI policy violation: CI Success is missing needs: ${missingNeeds.join(', ')}`);
  }

  // 5) Ensure these jobs exist (so needs aren't dangling)
  const missingJobs = requiredNeeds.filter((n) => !jobs[n]);
  if (missingJobs.length) {
    fail(`CI policy violation: missing required jobs: ${missingJobs.join(', ')}`);
  }

  // 6) Ensure semantic-release-dry-run depends on lockfile + build-artifact
  const sr = jobs['semantic-release-dry-run'];
  const srNeeds = asStringArray(sr.needs);
  for (const dep of ['lockfile', 'build-artifact']) {
    if (!srNeeds.includes(dep)) {
      fail(`CI policy violation: semantic-release-dry-run must need ${dep}`);
    }
  }

  // 7) Ensure no user-facing link points at the upstream project
  checkNoUpstreamLinks();

  console.log('CI policy check passed');
}

main();