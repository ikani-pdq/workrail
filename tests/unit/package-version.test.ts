import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  extractVersion,
  findNearestPackageJson,
  readPackageVersion,
  type PackageJsonFs,
} from '../../src/runtime/package-version.js';

/**
 * Fake filesystem over an absolute-path -> contents map. Prefer this to a
 * mock: the walk's behavior is what matters, not the calls it makes.
 */
function fakeFs(files: Record<string, string>): PackageJsonFs {
  return {
    fileExists: (filePath) => Object.prototype.hasOwnProperty.call(files, filePath),
    readFile: (filePath) => {
      const contents = files[filePath];
      if (contents === undefined) throw new Error(`ENOENT: ${filePath}`);
      return contents;
    },
  };
}

const root = path.resolve('/pkg');
const rootPkg = path.join(root, 'package.json');

describe('extractVersion', () => {
  it('returns the version from well-formed package.json text', () => {
    expect(extractVersion('{"version":"3.101.1"}')).toBe('3.101.1');
  });

  it('returns null for unparseable content', () => {
    expect(extractVersion('not json at all')).toBeNull();
  });

  it('returns null when version is missing', () => {
    expect(extractVersion('{"name":"@ikani-pdq/workrail"}')).toBeNull();
  });

  it('returns null when version is present but not a string', () => {
    expect(extractVersion('{"version":3}')).toBeNull();
  });

  it('returns null for an empty version string', () => {
    expect(extractVersion('{"version":""}')).toBeNull();
  });
});

describe('findNearestPackageJson', () => {
  it('finds package.json in the starting directory', () => {
    const fs = fakeFs({ [rootPkg]: '{"version":"1.0.0"}' });
    expect(findNearestPackageJson(root, fs)).toBe(rootPkg);
  });

  it('walks up through nested directories to the enclosing package', () => {
    // The exact shape that broke fatal-exit.ts: a file several levels deep
    // inside dist/, with no package.json of its own along the way.
    const deep = path.join(root, 'dist', 'mcp', 'transports');
    const fs = fakeFs({ [rootPkg]: '{"version":"1.0.0"}' });
    expect(findNearestPackageJson(deep, fs)).toBe(rootPkg);
  });

  it('stops at the nearest package.json rather than the outermost one', () => {
    const nested = path.join(root, 'console');
    const nestedPkg = path.join(nested, 'package.json');
    const fs = fakeFs({
      [rootPkg]: '{"version":"1.0.0"}',
      [nestedPkg]: '{"version":"2.0.0"}',
    });
    expect(findNearestPackageJson(nested, fs)).toBe(nestedPkg);
  });

  it('returns null when the walk reaches the filesystem root without a match', () => {
    expect(findNearestPackageJson(path.join(root, 'dist'), fakeFs({}))).toBeNull();
  });
});

describe('readPackageVersion', () => {
  it('resolves the version from an ancestor package.json', () => {
    const deep = path.join(root, 'dist', 'mcp', 'transports');
    const fs = fakeFs({ [rootPkg]: '{"version":"3.101.1"}' });
    expect(readPackageVersion(deep, fs)).toBe('3.101.1');
  });

  it('returns null when no package.json exists', () => {
    expect(readPackageVersion(root, fakeFs({}))).toBeNull();
  });

  it('returns null when the located package.json is malformed', () => {
    expect(readPackageVersion(root, fakeFs({ [rootPkg]: '{oops' }))).toBeNull();
  });

  it('returns null rather than propagating a read error', () => {
    const exploding: PackageJsonFs = {
      fileExists: () => true,
      readFile: () => {
        throw new Error('EACCES');
      },
    };
    expect(readPackageVersion(root, exploding)).toBeNull();
  });

  it('resolves this repository\'s own version when pointed at real source', () => {
    const version = readPackageVersion(__dirname);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
