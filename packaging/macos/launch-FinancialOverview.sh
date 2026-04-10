#!/usr/bin/env bash
# Start the bundled server from this folder (browser-only / portable layout; no Electron).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
NODE_BIN="$ROOT/runtime/node/bin/node"
SERVER_JS="$ROOT/server/dist/index.js"
export NODE_ENV=production
if [[ -x "$NODE_BIN" ]]; then
  exec "$NODE_BIN" "$SERVER_JS"
fi
exec node "$SERVER_JS"
