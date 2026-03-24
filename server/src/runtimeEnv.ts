import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repository root (parent of server/). */
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

const DATA_DIR_RESOLVED = path.resolve(process.env.DATA_DIR || './data');
/** Persisted env (API keys, OAuth, etc.) under the data directory so Docker volume mounts keep settings across restarts. */
export const RUNTIME_SETTINGS_PATH = path.join(DATA_DIR_RESOLVED, 'config', 'runtime-settings.json');
const LEGACY_RUNTIME_SETTINGS_PATH = path.join(PROJECT_ROOT, 'runtime-settings.json');

const LEGACY_ENV_PATH = path.join(PROJECT_ROOT, '.env');

function parseEnvFile(content: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

/**
 * One-time: copy project-root `runtime-settings.json` into `DATA_DIR/config/` (Docker-persisted path).
 */
function migrateLegacyRuntimeSettingsFile(): void {
    if (fs.existsSync(RUNTIME_SETTINGS_PATH)) {
        return;
    }
    if (!fs.existsSync(LEGACY_RUNTIME_SETTINGS_PATH)) {
        return;
    }
    fs.ensureDirSync(path.dirname(RUNTIME_SETTINGS_PATH));
    fs.copyFileSync(LEGACY_RUNTIME_SETTINGS_PATH, RUNTIME_SETTINGS_PATH);
    try {
        fs.unlinkSync(LEGACY_RUNTIME_SETTINGS_PATH);
    } catch {
        // keep legacy file if removal fails (e.g. permissions)
    }
    console.log(
        '[runtime] Migrated runtime-settings.json from project root to DATA_DIR/config/ (persists with your data volume)'
    );
}

/**
 * If a legacy `.env` exists, merge it into `runtime-settings.json` and remove `.env`.
 */
function migrateLegacyEnv(): void {
    if (!fs.existsSync(LEGACY_ENV_PATH)) {
        return;
    }

    let existing: Record<string, string> = {};
    if (fs.existsSync(RUNTIME_SETTINGS_PATH)) {
        existing = fs.readJsonSync(RUNTIME_SETTINGS_PATH) as Record<string, string>;
    }

    const raw = fs.readFileSync(LEGACY_ENV_PATH, 'utf8');
    const parsed = parseEnvFile(raw);
    const merged = { ...existing, ...parsed };
    fs.ensureDirSync(path.dirname(RUNTIME_SETTINGS_PATH));
    fs.writeJsonSync(RUNTIME_SETTINGS_PATH, merged, { spaces: 2 });
    fs.unlinkSync(LEGACY_ENV_PATH);
    console.log('[runtime] Migrated .env into runtime-settings.json and removed .env');
}

/**
 * Load `runtime-settings.json` and apply to `process.env` for keys not already set
 * (OS / Docker env wins).
 */
export function applyRuntimeSettings(): void {
    migrateLegacyRuntimeSettingsFile();
    migrateLegacyEnv();
    if (!fs.existsSync(RUNTIME_SETTINGS_PATH)) {
        return;
    }
    const settings = fs.readJsonSync(RUNTIME_SETTINGS_PATH) as Record<string, string>;
    for (const [key, value] of Object.entries(settings)) {
        if (value === undefined || value === null || value === '') continue;
        if (process.env[key] === undefined) {
            process.env[key] = String(value);
        }
    }
    if (process.env.GOOGLE_DRIVE_FOLDER_ID === undefined && process.env.DRIVE_FOLDER_ID) {
        process.env.GOOGLE_DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
    }
}

applyRuntimeSettings();
