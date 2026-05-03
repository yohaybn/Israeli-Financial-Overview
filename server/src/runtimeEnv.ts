import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repository root (parent of server/). */
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** Optional install-local JSON: `port`, `dataDir` (OS env still wins). */
export const FINANCIAL_OVERVIEW_CONFIG_PATH = path.join(PROJECT_ROOT, 'financial-overview.json');

function expandWindowsEnvInPath(s: string): string {
    if (process.platform !== 'win32') return s;
    return s.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`);
}

/** `~/...` in financial-overview.json (macOS/Linux); `%VAR%` on Windows. */
function expandPathFromConfig(s: string): string {
    const t = s.trim();
    if (t === '~') {
        return os.homedir();
    }
    if (t.startsWith('~/')) {
        return path.join(os.homedir(), t.slice(2));
    }
    return expandWindowsEnvInPath(t);
}

function loadFinancialOverviewConfig(): void {
    if (!fs.existsSync(FINANCIAL_OVERVIEW_CONFIG_PATH)) {
        return;
    }
    try {
        const cfg = fs.readJsonSync(FINANCIAL_OVERVIEW_CONFIG_PATH) as Record<string, unknown>;
        if (cfg.port != null && cfg.port !== '' && process.env.PORT === undefined) {
            process.env.PORT = String(cfg.port);
        }
        if (cfg.dataDir != null && typeof cfg.dataDir === 'string' && cfg.dataDir.trim() !== '' && process.env.DATA_DIR === undefined) {
            process.env.DATA_DIR = expandPathFromConfig(cfg.dataDir.trim());
        }
    } catch (e) {
        console.warn('[runtime] Could not read financial-overview.json:', (e as Error).message);
    }
}

loadFinancialOverviewConfig();

/** When unset, use repo `data/` so `runtime-settings.json` path does not depend on process.cwd(). */
function defaultDataDirForRuntime(): string {
    const fromEnv = process.env.DATA_DIR;
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
        return fromEnv;
    }
    return path.join(PROJECT_ROOT, 'data');
}

const DATA_DIR_RESOLVED = path.resolve(defaultDataDirForRuntime());
/** Persisted env (API keys, OAuth, etc.) under the data directory so Docker volume mounts keep settings across restarts. */
export const RUNTIME_SETTINGS_PATH = path.join(DATA_DIR_RESOLVED, 'config', 'runtime-settings.json');

/** Dev layout: some clones keep `runtime-settings.json` under `server/data/` while DATA_DIR defaults to repo `data/`. */
const LEGACY_DEV_RUNTIME_SETTINGS_PATH = path.join(PROJECT_ROOT, 'server', 'data', 'config', 'runtime-settings.json');
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

    let settings: Record<string, string>;
    if (fs.existsSync(RUNTIME_SETTINGS_PATH)) {
        settings = fs.readJsonSync(RUNTIME_SETTINGS_PATH) as Record<string, string>;
    } else if (fs.existsSync(LEGACY_DEV_RUNTIME_SETTINGS_PATH)) {
        settings = fs.readJsonSync(LEGACY_DEV_RUNTIME_SETTINGS_PATH) as Record<string, string>;
    } else {
        return;
    }

    const primaryPath = fs.existsSync(RUNTIME_SETTINGS_PATH) ? RUNTIME_SETTINGS_PATH : LEGACY_DEV_RUNTIME_SETTINGS_PATH;
    for (const [key, value] of Object.entries(settings)) {
        if (value === undefined || value === null || value === '') continue;
        if (process.env[key] === undefined) {
            process.env[key] = String(value);
        }
    }

    // Fill any keys still missing (e.g. COMMUNITY_INSIGHT_RULES_SECRET) from legacy dev path.
    if (
        fs.existsSync(LEGACY_DEV_RUNTIME_SETTINGS_PATH) &&
        path.resolve(LEGACY_DEV_RUNTIME_SETTINGS_PATH) !== path.resolve(primaryPath)
    ) {
        const extra = fs.readJsonSync(LEGACY_DEV_RUNTIME_SETTINGS_PATH) as Record<string, string>;
        for (const [key, value] of Object.entries(extra)) {
            if (value === undefined || value === null || value === '') continue;
            if (process.env[key] === undefined) {
                process.env[key] = String(value);
            }
        }
    }

    if (process.env.GOOGLE_DRIVE_FOLDER_ID === undefined && process.env.DRIVE_FOLDER_ID) {
        process.env.GOOGLE_DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
    }

    // Docker / Compose almost always set `DATA_DIR=/data` in the image or environment. The UI
    // persists a user-chosen folder in `runtime-settings.json` (Maintenance). If we never apply
    // that value when env is already set, restarts keep using `/data` while the previous session
    // wrote `scheduler_config.json`, `app.db`, etc. under the path from the file — looks like
    // settings "do not survive" the container reboot.
    if (process.env.DATA_DIR_STICKY === '1') {
        return;
    }
    const dataDirFromFile = settings.DATA_DIR;
    if (typeof dataDirFromFile !== 'string' || !dataDirFromFile.trim()) {
        return;
    }
    try {
        const expanded = expandPathFromConfig(dataDirFromFile.trim());
        const resolvedFile = path.resolve(expanded);
        const resolvedEnv = path.resolve(defaultDataDirForRuntime());
        if (resolvedFile !== resolvedEnv) {
            const prev = process.env.DATA_DIR;
            process.env.DATA_DIR = expanded;
            console.log(
                `[runtime] DATA_DIR from runtime-settings.json (${expanded}) overrides process.env (${prev ?? '(unset)'})`
            );
        }
    } catch (e) {
        console.warn('[runtime] Could not apply DATA_DIR from runtime-settings.json:', (e as Error).message);
    }
}

applyRuntimeSettings();

/**
 * Pin unset DATA_DIR to repo `data/` (same default as RUNTIME_SETTINGS_PATH / defaultDataDirForRuntime).
 * Otherwise scheduler_config.json, mqtt_config.json, app.db, etc. use `./data` and follow process.cwd(),
 * so a restart from a different working directory looks like settings were lost.
 */
function ensureDefaultDataDirEnv(): void {
    const cur = process.env.DATA_DIR;
    if (typeof cur === 'string' && cur.trim() !== '') {
        return;
    }
    process.env.DATA_DIR = path.join(PROJECT_ROOT, 'data');
}

ensureDefaultDataDirEnv();
