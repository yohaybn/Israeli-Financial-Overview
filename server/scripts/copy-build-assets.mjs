/**
 * tsc does not emit non-TS files. Copy help markdown and bundled GUIDE into dist/
 * so Docker/production and Help Assistant have full documentation.
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const distAssets = path.join(serverRoot, 'dist', 'assets');
const srcAssets = path.join(serverRoot, 'src', 'assets');

await fs.ensureDir(distAssets);
await fs.copy(srcAssets, distAssets, { overwrite: true });

const guideSrc = path.join(serverRoot, '..', 'client', 'public', 'GUIDE.html');
const guideDest = path.join(distAssets, 'help', 'GUIDE.html');
await fs.copy(guideSrc, guideDest, { overwrite: true });

console.log('copy-build-assets: copied src/assets and GUIDE.html to dist/assets');
