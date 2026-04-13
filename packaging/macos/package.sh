#!/usr/bin/env bash
# Build dist/macos-package (same layout as Windows package + darwin Node in runtime/node/bin/node).
# Run from repo root: bash packaging/macos/package.sh
# Requires: macOS, bash, curl, Node 20+ for the build.

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-20.18.3}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$REPO_ROOT/dist/macos-package"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Repo: $REPO_ROOT"
echo "Stage: $STAGE"

cd "$REPO_ROOT"

export PUPPETEER_SKIP_DOWNLOAD="${PUPPETEER_SKIP_DOWNLOAD:-true}"

if [[ "${CI:-}" == "true" ]]; then
  echo ""
  echo "[1/6] npm ci (CI mode) ..."
  npm ci
else
  echo ""
  echo "[1/6] npm install ..."
  npm install
fi

echo ""
echo "[2/6] App icons (512×512 required for macOS Electron) ..."
# npm ci can leave sharp's optional native addon for the lockfile's host OS; fix for this runner
npm install --no-save -w client sharp
npm run icons:generate -w client

export VITE_INSTALL_KIND="${VITE_INSTALL_KIND:-macos}"
export VITE_APP_BUILD_VERSION="${VITE_APP_BUILD_VERSION:-local}"

echo ""
echo "[3/6] Build workspaces ..."
npm run build -w shared
npm run build -w client
npm run build -w server

echo ""
echo "[4/6] Prune devDependencies ..."
npm prune --omit=dev || echo "npm prune failed (continuing; package may be larger)."

rm -rf "$STAGE"
mkdir -p "$STAGE"

echo ""
echo "[5/6] Copy app tree ..."

cp "$REPO_ROOT/package.json" "$REPO_ROOT/package-lock.json" "$STAGE/"

copy_tree() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  rsync -a --delete \
    --exclude '.vite' \
    --exclude 'coverage' \
    "$src/" "$dst/"
}

copy_tree "$REPO_ROOT/node_modules" "$STAGE/node_modules"
copy_tree "$REPO_ROOT/shared" "$STAGE/shared"
copy_tree "$REPO_ROOT/server" "$STAGE/server"
copy_tree "$REPO_ROOT/client" "$STAGE/client"

echo ""
echo "Restore devDependencies at repo root (electron-builder) ..."
cd "$REPO_ROOT"
npm install

for rel in client/src client/public server/src shared/src; do
  rm -rf "$STAGE/$rel"
done

cp "$SCRIPT_DIR/launch-FinancialOverview.sh" "$STAGE/"
cp "$SCRIPT_DIR/open-browser.sh" "$STAGE/"
chmod +x "$STAGE/launch-FinancialOverview.sh" "$STAGE/open-browser.sh"

if [[ -f "$REPO_ROOT/client/public/favicon.ico" ]]; then
  cp "$REPO_ROOT/client/public/favicon.ico" "$STAGE/app.ico"
  echo "Copied app icon -> app.ico"
fi

cp "$SCRIPT_DIR/financial-overview.defaults.json" "$STAGE/financial-overview.json"
cp "$SCRIPT_DIR/README_MACOS.txt" "$STAGE/"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) NODE_ARCH=arm64 ;;
  x86_64) NODE_ARCH=x64 ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

echo ""
echo "[6/6] Download Node.js v$NODE_VERSION darwin-$NODE_ARCH ..."
RUNTIME_PARENT="$STAGE/runtime"
TAR_NAME="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${TAR_NAME}"
TMP_TAR="$(mktemp -t node.XXXXXX.tar.gz)"
curl -fsSL "$URL" -o "$TMP_TAR"
mkdir -p "$RUNTIME_PARENT/_extract"
tar -xzf "$TMP_TAR" -C "$RUNTIME_PARENT/_extract"
rm -f "$TMP_TAR"
INNER="$(find "$RUNTIME_PARENT/_extract" -maxdepth 1 -type d -name "node-v*-darwin-${NODE_ARCH}" | head -1)"
if [[ -z "$INNER" || ! -d "$INNER" ]]; then
  echo "Could not find extracted Node folder under runtime/_extract" >&2
  exit 1
fi
rm -rf "$RUNTIME_PARENT/node"
mv "$INNER" "$RUNTIME_PARENT/node"
rm -rf "$RUNTIME_PARENT/_extract"

chmod +x "$RUNTIME_PARENT/node/bin/node" 2>/dev/null || true

echo ""
echo "Done. Package ready at:"
echo "  $STAGE"
echo ""
echo "Next: build the macOS app (electron-builder):"
echo "  npm run dist:mac -w desktop-electron"
echo "  Output: dist/electron-mac/"
