#!/usr/bin/env bash
# Launches the `workrail` MCP server, refusing to start if the globally
# installed package doesn't match this checkout's own package.json version.
#
# Used as the `workrail` entry's command in .mcp.json / MCP client configs.
# Prevents silently running whatever build happens to be on PATH -- this
# repo does not publish to npm, so the only trusted install path is a local
# `npm pack && npm install -g` from this checkout.
#
# The pinned version is read from package.json directly, not hardcoded, so
# it never drifts out of sync after a version bump -- rebuild, reinstall,
# nothing else to update.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PINNED="$(node -p "require('$PROJECT_ROOT/package.json').version")"
INSTALLED="$(node -p "require('$(npm root -g)/@ikani.samani/workrail/package.json').version" 2>/dev/null || true)"

if [ "$INSTALLED" != "$PINNED" ]; then
  echo "workrail: pinned version $PINNED not found (installed: ${INSTALLED:-none}). Reinstall: npm pack && npm install -g ./ikani.samani-workrail-$PINNED.tgz" >&2
  exit 1
fi

exec workrail
