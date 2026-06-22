import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scan = JSON.parse(fs.readFileSync(path.join(projectRoot, '.understand-anything/tmp/ua-scan-files.json'), 'utf8'));
const importOut = JSON.parse(fs.readFileSync(path.join(projectRoot, '.understand-anything/tmp/ua-import-map-output.json'), 'utf8'));

const languages = Object.keys(scan.stats.byLanguage).sort();
const frameworks = ['React', 'Vite', 'Express', 'Tailwind CSS', 'Electron', 'Docker', 'GitHub Actions', 'Socket.IO', 'TanStack Query'];

const result = {
  name: 'israeli-financial-overview',
  description: 'Self-hosted personal finance tool for aggregating Israeli bank and credit card transactions, with dashboard analytics, AI-assisted categorization, Telegram/MQTT integrations, and optional desktop packaging via Electron. Note: this project has over 100 source files; consider scoping analysis to a subdirectory for faster results.',
  languages,
  frameworks,
  files: scan.files,
  totalFiles: scan.totalFiles,
  filteredByIgnore: scan.filteredByIgnore,
  estimatedComplexity: scan.estimatedComplexity,
  importMap: importOut.importMap,
};

fs.mkdirSync(path.join(projectRoot, '.understand-anything/intermediate'), { recursive: true });
fs.writeFileSync(path.join(projectRoot, '.understand-anything/intermediate/scan-result.json'), JSON.stringify(result, null, 2));
console.log('scan-result.json written:', result.totalFiles, 'files');
