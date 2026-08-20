import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scan = JSON.parse(fs.readFileSync(path.join(projectRoot, '.understand-anything/tmp/ua-scan-files.json'), 'utf8'));
const out = { projectRoot, files: scan.files };
fs.writeFileSync(path.join(projectRoot, '.understand-anything/tmp/ua-import-map-input.json'), JSON.stringify(out));
