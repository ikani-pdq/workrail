#!/usr/bin/env bash
# Launches the `workrail` MCP server, refusing to start if the globally
# installed package doesn't match this checkout's own package.json version.
#
# Used as the `workrail` entry's command in .mcp.json / MCP client configs.
# Prevents silently running whatever build happens to be on PATH -- this
# repo does not publish to npm, so the only trusted install path is a local
# `npm pack && npm install -g` from this checkout.
#
# The pinned version and package name are both read from package.json
# directly, not hardcoded, so neither drifts out of sync after a version
# bump or a package rename -- rebuild, reinstall, nothing else to update.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PKG_NAME="$(node -p "require('$PROJECT_ROOT/package.json').name")"
PINNED="$(node -p "require('$PROJECT_ROOT/package.json').version")"
INSTALLED="$(node -p "require('$(npm root -g)/$PKG_NAME/package.json').version" 2>/dev/null || true)"

if [ "$INSTALLED" != "$PINNED" ]; then
  TARBALL_PREFIX="$(echo "$PKG_NAME" | sed -e 's#^@##' -e 's#/#-#' -e 's/\./-/g')"
  echo "workrail: pinned version $PINNED not found (installed: ${INSTALLED:-none}). Reinstall: npm pack && npm install -g ./${TARBALL_PREFIX}-$PINNED.tgz" >&2
  exit 1
fi

exec workrail
