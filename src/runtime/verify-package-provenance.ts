/**
 * Pure provenance check: does an install's own package.json point back at the
 * audited repository, or could it be a differently-sourced build (e.g. a
 * stale/unaudited fork publishing under a lookalike npm name)?
 *
 * WHY: ikani-pdq/workrail never publishes to a registry, but a separate
 * fork (iconza98/workrail) publishes releases to public npm under the same
 * package name this repo used to use, with npm provenance attesting to that
 * other repository. Someone who installs via that name, or via npx/@latest
 * against it, would be running unaudited code while believing it came from
 * this repo. This check gives the running process a way to notice that on
 * its own, independent of which install path was used to get there.
 */

import { REPOSITORY_MARKER } from '../constants/repository.js';

const EXPECTED_REPOSITORY_MARKER = REPOSITORY_MARKER;

export interface PackageProvenanceCheckResult {
  ok: boolean;
  name?: string;
  version?: string;
  repositoryUrl?: string;
}

function extractRepositoryUrl(repository: unknown): string | undefined {
  if (typeof repository === 'string') return repository;
  if (
    typeof repository === 'object' &&
    repository !== null &&
    typeof (repository as { url?: unknown }).url === 'string'
  ) {
    return (repository as { url: string }).url;
  }
  return undefined;
}

export function checkPackageProvenance(pkgJsonRaw: string): PackageProvenanceCheckResult {
  let parsed: { name?: unknown; version?: unknown; repository?: unknown };
  try {
    parsed = JSON.parse(pkgJsonRaw) as typeof parsed;
  } catch {
    return { ok: false };
  }

  const name = typeof parsed.name === 'string' ? parsed.name : undefined;
  const version = typeof parsed.version === 'string' ? parsed.version : undefined;
  const repositoryUrl = extractRepositoryUrl(parsed.repository);

  return {
    ok: typeof repositoryUrl === 'string' && repositoryUrl.includes(EXPECTED_REPOSITORY_MARKER),
    name,
    version,
    repositoryUrl,
  };
}
