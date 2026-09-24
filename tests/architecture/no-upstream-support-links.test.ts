/**
 * Fork identity: nothing user-facing may point at the upstream project.
 *
 * This fork merges upstream periodically (see docs/development.md and the
 * pdq/merge-upstream-* branches), which is the mechanism that reintroduces
 * upstream links. scripts/ci-policy-check.js is the enforcement; these tests
 * are its regression net, since a guard that is only ever exercised in the
 * passing direction can silently stop guarding anything.
 *
 * Each case runs the real script against a temporary commit in a scratch
 * clone, so the assertions exercise the shipped code path rather than a
 * reimplementation of its logic.
 *
 * See issue #46.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');

let clone: string;

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/**
 * Runs the policy script in the scratch clone. Returns its exit code:
 * 0 when every check passes, non-zero when one fails.
 */
function runPolicyCheck(): { code: number; output: string } {
  try {
    const output = execFileSync('node', ['scripts/ci-policy-check.js'], {
      cwd: clone,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** Writes a file, stages it (git grep only sees tracked content), runs the check, then reverts. */
function withStagedFile(relPath: string, contents: string): { code: number; output: string } {
  const full = path.join(clone, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const existed = fs.existsSync(full);
  const original = existed ? fs.readFileSync(full, 'utf8') : undefined;

  fs.writeFileSync(full, existed ? `${original}\n${contents}\n` : `${contents}\n`);
  git(['add', '-f', relPath], clone);
  try {
    return runPolicyCheck();
  } finally {
    if (existed && original !== undefined) {
      fs.writeFileSync(full, original);
      git(['add', '-f', relPath], clone);
    } else {
      git(['rm', '--cached', '-q', relPath], clone);
      fs.rmSync(full, { force: true });
    }
  }
}

beforeAll(() => {
  clone = fs.mkdtempSync(path.join(os.tmpdir(), 'workrail-policy-'));
  // A worktree-shaped copy: the script only reads tracked files via git grep,
  // so a checkout of HEAD plus the script itself is sufficient and fast.
  git(['init', '-q'], clone);
  git(['config', 'user.email', 'test@example.invalid'], clone);
  git(['config', 'user.name', 'test'], clone);

  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT_DIR, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  for (const rel of tracked) {
    const src = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
    const dest = path.join(clone, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  git(['add', '-A'], clone);
  git(['commit', '-q', '-m', 'baseline'], clone);

  // The script requires js-yaml. Without this the script dies on module
  // resolution and every negative case below would "pass" on the wrong exit
  // code, which is the failure mode this whole file exists to prevent.
  fs.symlinkSync(path.join(ROOT_DIR, 'node_modules'), path.join(clone, 'node_modules'), 'dir');
}, 60_000);

afterAll(() => {
  if (clone) fs.rmSync(clone, { recursive: true, force: true });
});

describe('ci-policy-check: upstream link guard', () => {
  it('passes on the current tree', () => {
    const { code, output } = runPolicyCheck();
    expect(output).toContain('CI policy check passed');
    expect(code).toBe(0);
  });

  // The broad check: any upstream URL outside the allowlist.
  it.each([
    ['a source file', 'src/__probe__.ts', '// https://github.com/exaudeus/workrail'],
    ['a published doc', 'docs/__probe__.md', 'See https://github.com/EtienneBBeaulac/workrail'],
    ['mixed case', 'docs/__probe__.md', 'See https://GitHub.com/EtienneBBeaulac/workrail'],
  ])('fails when an upstream URL is reintroduced into %s', (_label, file, line) => {
    const { code, output } = withStagedFile(file, line);
    // Assert the reason, not just the exit code: a crash also exits non-zero.
    expect(output).toContain('CI policy violation');
    expect(code).not.toBe(0);
  });

  // The support check: allowlisted paths may reference upstream, never route
  // a user there for help.
  it.each([
    ['issues', 'https://github.com/EtienneBBeaulac/workrail/issues'],
    ['discussions', 'https://github.com/EtienneBBeaulac/workrail/discussions'],
    ['an individual pull request', 'https://github.com/EtienneBBeaulac/workrail/pull/1022'],
  ])('fails when an allowlisted file routes a user to upstream %s', (_label, url) => {
    const { code, output } = withStagedFile('README.md', `Report bugs at ${url}`);
    expect(output).toContain('a user is being sent upstream for help');
    expect(code).not.toBe(0);
  });

  // README is allowlisted whole-file so its attribution survives; a bare
  // upstream link added by a merge must still fail. Upstream's own README
  // footer carries exactly this shape.
  it('fails on a bare upstream repository link in README', () => {
    const { code, output } = withStagedFile(
      'README.md',
      '[GitHub](https://github.com/EtienneBBeaulac/workrail) - MIT License'
    );
    expect(output).toContain('outside of\nattribution');
    expect(code).not.toBe(0);
  });

  it('still allows the fork attribution README is exempt for', () => {
    const { code } = withStagedFile(
      'README.md',
      'This is a hardened fork of [WorkRail](https://github.com/EtienneBBeaulac/workrail).'
    );
    expect(code).toBe(0);
  });

  it('still allows an upstream issue URL recorded as provenance', () => {
    const { code } = withStagedFile(
      'docs/adrs/__probe__.md',
      '**Upstream issue:** https://github.com/EtienneBBeaulac/workrail/issues/920'
    );
    expect(code).toBe(0);
  });

  it('does not flag the upstream package name, which is referenced deliberately', () => {
    const { code } = withStagedFile(
      'docs/__probe__.md',
      'The upstream project publishes `@exaudeus/workrail`.'
    );
    expect(code).toBe(0);
  });
});
