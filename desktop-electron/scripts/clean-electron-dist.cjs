/**
 * Remove dist/electron-win before electron-builder so UnpackElectron does not fail with
 * EBUSY / "file is being used by another process" on Windows (AV, indexer, stale handles).
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const outDir = path.join(repoRoot, 'dist', 'electron-win');

try {
    fs.rmSync(outDir, { recursive: true, force: true });
} catch (e) {
    if (e && e.code !== 'ENOENT') {
        console.error('[clean-electron-dist] Failed to remove', outDir, e.message);
        process.exit(1);
    }
}
