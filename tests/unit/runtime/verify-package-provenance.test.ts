import { describe, it, expect } from 'vitest';
import { checkPackageProvenance } from '../../../src/runtime/verify-package-provenance.js';

describe('checkPackageProvenance', () => {
  it('accepts a repository.url object pointing at ikani-pdq/workrail', () => {
    const result = checkPackageProvenance(
      JSON.stringify({
        name: '@ikani-pdq/workrail',
        version: '3.102.0',
        repository: { type: 'git', url: 'git+https://github.com/ikani-pdq/workrail.git' },
      })
    );
    expect(result).toEqual({
      ok: true,
      name: '@ikani-pdq/workrail',
      version: '3.102.0',
      repositoryUrl: 'git+https://github.com/ikani-pdq/workrail.git',
    });
  });

  it('accepts a plain string repository field pointing at ikani-pdq/workrail', () => {
    const result = checkPackageProvenance(
      JSON.stringify({
        name: '@ikani-pdq/workrail',
        version: '1.0.0',
        repository: 'github.com/ikani-pdq/workrail',
      })
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a repository field pointing at a different repository', () => {
    const result = checkPackageProvenance(
      JSON.stringify({
        name: '@ikani.samani/workrail',
        version: '3.102.0',
        repository: { type: 'git', url: 'git+https://github.com/iconza98/workrail.git' },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.repositoryUrl).toBe('git+https://github.com/iconza98/workrail.git');
  });

  it('rejects when the repository field is missing entirely', () => {
    const result = checkPackageProvenance(JSON.stringify({ name: 'x', version: '1.0.0' }));
    expect(result.ok).toBe(false);
    expect(result.repositoryUrl).toBeUndefined();
  });

  it('rejects malformed JSON without throwing', () => {
    const result = checkPackageProvenance('{ not valid json');
    expect(result.ok).toBe(false);
  });
});
