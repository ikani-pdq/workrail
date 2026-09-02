import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { writePendingDeliverySidecar } from '../../src/trigger/pending-delivery-sidecar.js';

describe('writePendingDeliverySidecar file permissions', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    for (const root of tempRoots) {
      await fs.rm(root, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  it('writes the sidecar file with mode 0o600 (owner-only rw)', async () => {
    // Skip on Windows: chmod / file modes are not POSIX there.
    if (process.platform === 'win32') return;

    const sessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workrail-sidecar-perms-'));
    tempRoots.push(sessionsDir);

    await writePendingDeliverySidecar(
      {
        adapterId: 'github_draft_review',
        daemonSessionId: 'sess-perms-test',
        createdAt: new Date(0).toISOString(),
        state: {
          reviewId: 1,
          prNumber: 1,
          prRepo: 'owner/repo',
          token: 'ghp_fake_token_for_test',
          login: 'test-bot',
          workrailSessionId: 'sess-perms-test',
        },
      },
      sessionsDir,
    );

    const sidecarPath = path.join(sessionsDir, 'pending-delivery-sess-perms-test.json');
    const stat = await fs.stat(sidecarPath);
    // A missing `mode` arg would default to 0o666 & ~umask (typically 0o644, world/group-readable).
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
