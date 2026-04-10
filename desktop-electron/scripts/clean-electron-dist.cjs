/**
 * Remove dist/electron-win and dist/electron-mac before electron-builder so unpack does not fail
 * with EBUSY / stale handles (especially on Windows).
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const dirs = [
    path.join(repoRoot, 'dist', 'electron-win'),
    path.join(repoRoot, 'dist', 'electron-mac'),
];

for (const outDir of dirs) {
    try {
        fs.rmSync(outDir, { recursive: true, force: true });
    } catch (e) {
        if (e && e.code !== 'ENOENT') {
            console.error('[clean-electron-dist] Failed to remove', outDir, e.message);
            process.exit(1);
        }
    }
}
