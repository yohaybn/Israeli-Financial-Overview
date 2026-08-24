#!/usr/bin/env node
/**
 * SINGLE SOURCE OF TRUTH for ports (dev, tests, packaging, Docker).
 *
 * Configure once in `data/config/runtime-settings.json`:
 *   { "PORT": "3000", "CLIENT_PORT": "5173" }
 *
 * Resolution order (first wins):
 *   1. Environment (PORT / CLIENT_PORT) — lets CI or one-off runs override
 *   2. data/config/runtime-settings.json
 *   3. Defaults: server 3000, client 5173
 *
 * Usage from other scripts:
 *   import { resolvePorts } from './ports.mjs';
 *   const { serverPort, clientPort } = resolvePorts();
 *
 * CLI (prints values):
 *   node scripts/ports.mjs            -> "3000 5173"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_SERVER_PORT = 3000;
export const DEFAULT_CLIENT_PORT = 5173;

function readRuntimeSettings() {
    const candidates = [
        path.join(PROJECT_ROOT, 'data', 'config', 'runtime-settings.json'),
        path.join(PROJECT_ROOT, 'runtime-settings.json'), // legacy location
    ];
    for (const p of candidates) {
        try {
            if (!fs.existsSync(p)) continue;
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (j && typeof j === 'object') return j;
        } catch {
            // try next candidate
        }
    }
    return {};
}

function toInt(v, fallback) {
    const n = parseInt(String(v ?? '').trim(), 10);
    return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
}

/** Resolve both ports from env → runtime-settings.json → defaults. */
export function resolvePorts() {
    const settings = readRuntimeSettings();
    const serverPort = toInt(process.env.PORT ?? settings.PORT, DEFAULT_SERVER_PORT);
    const clientPort = toInt(process.env.CLIENT_PORT ?? process.env.VITE_PORT ?? settings.CLIENT_PORT, DEFAULT_CLIENT_PORT);
    return { serverPort, clientPort };
}

// CLI mode
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { serverPort, clientPort } = resolvePorts();
    console.log(`${serverPort} ${clientPort}`);
}
