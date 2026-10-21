#!/bin/bash
# Builds viewer/hud.js, the window's copy of the HUD drawing, from
# hooks/hud.ts, so the pane and the window draw the same thing. Needs tsc.
set -euo pipefail
cd "$(dirname "$0")/.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
tsc hooks/hud.ts --target es2020 --module es2020 --outDir "$out" --ignoreConfig --skipLibCheck --noResolve --isolatedModules >/dev/null || true
test -s "$out/hud.js"
{
  echo '// Generated from hooks/hud.ts by scripts/build-viewer.sh; do not edit.'
  sed -e '/^import /d' -e 's/^export //' "$out/hud.js"
} >viewer/hud.js
