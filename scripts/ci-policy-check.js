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
  // triggers.yml is a protected file (AGENTS.md) carrying the previous
  // maintainer's live daemon config, which names upstream paths and accounts;
  // tests/unit/worktrain-trigger-test.test.ts uses an upstream URL as parser
  // fixture data.
  'triggers.yml',
  'tests/unit/worktrain-trigger-test.test.ts',

  // Two status badges whose href still names the upstream project's pre-rename
  // repo. Same shape as the two deleted from docs/reference/ in this change,
  // but docs/implementation/ is a declared non-goal of #46 -- tracked in #48.
  // Exempted by exact path rather than by directory, so an upstream URL added
  // elsewhere under docs/implementation/ is still caught -- with one known
  // blind spot: 02-architecture.md and 04-testing-strategy.md carry the org
  // inside a shields.io image src (img.shields.io/github/actions/...), which
  // this pattern does not match and therefore does not need to exempt. #48
  // covers those.
  'docs/implementation/09-simple-workflow-guide.md',
  'docs/implementation/13-advanced-validation-guide.md',
];

// An allowlisted path may legitimately reference upstream -- attribution, an
// ADR citing an upstream PR, provenance in the backlog. It may never route a
// user to upstream for help, which is the actual failure issue #46 describes.
// This narrower pattern is checked everywhere except the places where linking
// an upstream issue IS the provenance being recorded.
const UPSTREAM_SUPPORT_URL_PATTERN =
  'github\\.com/(exaudeus|EtienneBBeaulac)/[A-Za-z0-9._-]+/(issues|discussions|pulls?|security)';

// Narrower than UPSTREAM_URL_ALLOWLIST on purpose: only the places where
// linking an upstream issue IS the provenance being recorded. docs/design and
// docs/plans are deliberately absent -- they hold transient working papers, so
// a support link there is a mistake rather than a record.
const UPSTREAM_SUPPORT_ALLOWLIST = [
  'docs/adrs',
  'docs/history',
  'design-docs',
  'docs/ideas/backlog.md',
  'triggers.yml',
  'tests/unit/worktrain-trigger-test.test.ts',
];

// Returns { status, stdout }. git grep exit codes: 0 = matches found,
// 1 = no matches, >1 = error. A match is a policy violation here, so 0 is the
// failure case -- do not collapse this into a truthiness check.
function runUpstreamGrep(pattern, allowlist, paths = ['.']) {
  const args = ['grep', '-niE', pattern, '--', ...paths, ...allowlist.map((p) => `:!${p}`)];
  try {
    return { status: 0, stdout: execFileSync('git', args, { encoding: 'utf8' }) };
  } catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : -1,
      stdout: err.stdout || '',
      detail: err.code || err.message,
    };
  }
}

// README.md is exempt from the checks above so its attribution survives, but a
// whole-file exemption also hides anything an upstream merge adds to it.
// Upstream's own README footer carries a bare repository link with no path
// suffix, so no support pattern matches it, and docs/development.md names
// README.md as a guaranteed merge conflict -- this is a live path, not a
// hypothetical one.
//
// So: every upstream reference in README.md must sit on a line that reads as
// attribution. A bare link dropped in by a merge does not, and fails.
//
// Matched by shape rather than by exact text, deliberately: spelling the
// upstream URL out here would make this script trip its own check.
const README_ATTRIBUTION_MARKER = /fork of |fork tracks /i;

function checkReadmeUpstreamRefs() {
  const { status, stdout, detail } = runUpstreamGrep(UPSTREAM_URL_PATTERN, [], ['README.md']);

  if (status !== 0 && status !== 1) {
    fail(
      `CI policy violation: README upstream-reference check could not run ` +
        `(git grep exit ${status}${detail ? `: ${detail}` : ''})`
    );
  }

  const offending = stdout
    .split('\n')
    .filter(Boolean)
    .filter((line) => !README_ATTRIBUTION_MARKER.test(line));

  if (offending.length) {
    fail(
      'CI policy violation: README.md points at the upstream project outside of\n' +
        'attribution. README.md is exempt from the broad link check so its\n' +
        'attribution can survive, which means anything else added here would\n' +
        'otherwise ship unnoticed -- including a bare repository link carried in\n' +
        'by an upstream merge. Repoint it at github.com/ikani-pdq/workrail.\n\n' +
        offending.map((l) => `  ${l.trim()}`).join('\n')
    );
  }
}

function checkNoUpstreamSupportLinks() {
  const { status, stdout, detail } = runUpstreamGrep(
    UPSTREAM_SUPPORT_URL_PATTERN,
    UPSTREAM_SUPPORT_ALLOWLIST
  );

  if (status === 1) return;

  if (status === 0) {
    fail(
      'CI policy violation: a user is being sent upstream for help.\n' +
        'These links route users to the upstream project\'s issue tracker or\n' +
        'discussions. Repoint them at github.com/ikani-pdq/workrail. Being on\n' +
        'an UPSTREAM_URL_ALLOWLIST path does not exempt a support destination.\n\n' +
        stdout.trimEnd()
    );
  }

  fail(
    `CI policy violation: upstream support-link check could not run ` +
      `(git grep exit ${status}${detail ? `: ${detail}` : ''})`
  );
}

function checkNoUpstreamLinks() {
  const { status, stdout, detail } = runUpstreamGrep(
    UPSTREAM_URL_PATTERN,
    UPSTREAM_URL_ALLOWLIST
  );

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

  fail(
    `CI policy violation: upstream-link check could not run ` +
      `(git grep exit ${status}${detail ? `: ${detail}` : ''})`
  );
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
    'ci-policy',
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

  // 8) Ensure no allowlisted path routes a user upstream for help
  checkNoUpstreamSupportLinks();

  // 9) Ensure README.md carries only its two deliberate attribution references
  checkReadmeUpstreamRefs();

  console.log('CI policy check passed');
}

main();