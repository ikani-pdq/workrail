/**
 * Canonical repository identity for this fork.
 *
 * WHY a shared constant: this URL is what tells a user where to get help, and
 * where the code they are running came from. It previously appeared as seven
 * separate string literals across src/, which is how a fork ends up half
 * repointed -- issue #46 existed because several of them still named the
 * upstream project, and three named a repository that returns 404. Deriving
 * every reference from one place turns that class of drift into a compile
 * error rather than something a reviewer has to notice.
 *
 * scripts/ci-policy-check.js guards the same invariant for Markdown, JSON and
 * YAML, where no compiler can reach.
 */

export const REPOSITORY_OWNER = 'ikani-pdq';
export const REPOSITORY_NAME = 'workrail';

/** Bare repository URL, for attribution or a "source" link. */
export const REPOSITORY_URL = `https://github.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}`;

/** Host-and-path marker used to check an install's own package.json provenance. */
export const REPOSITORY_MARKER = `github.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}`;

/** Where users are sent to report a problem. */
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;

/**
 * Permalink to a file on the default branch, for pointers written into
 * generated files that a user reads outside the repository.
 */
export function repositoryFileUrl(pathFromRoot: string): string {
  return `${REPOSITORY_URL}/blob/main/${pathFromRoot}`;
}
