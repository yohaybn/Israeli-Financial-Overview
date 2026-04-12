import fs from 'fs-extra';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '@app/shared';
import { RUNTIME_SETTINGS_PATH } from '../runtimeEnv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESTART_TRIGGER_PATH = path.resolve(__dirname, '../restart-trigger.json');
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const DASHBOARD_CONFIG_PATH = path.join(DATA_DIR, 'config', 'dashboard.json');

export class ConfigService {
    private readonly allowedKeys = [
        'DRIVE_FOLDER_ID',
        'GEMINI_API_KEY',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REDIRECT_URI',
        'PORT',
        'DATA_DIR'
    ];

    private readonly sensitiveKeys = [
        'GEMINI_API_KEY',
        'GOOGLE_CLIENT_SECRET'
    ];

    async getEnv(): Promise<Record<string, string>> {
        let stored: Record<string, string> = {};
        if (await fs.pathExists(RUNTIME_SETTINGS_PATH)) {
            stored = (await fs.readJson(RUNTIME_SETTINGS_PATH)) as Record<string, string>;
        }

        const env: Record<string, string> = {};

        for (const key of this.allowedKeys) {
            const value = stored[key];
            if (value === undefined || String(value).trim() === '') continue;
            env[key] = this.sensitiveKeys.includes(key) ? this.maskValue(value) : value;
        }

        // Expose keys that exist only in process.env (e.g. Docker / .env at startup) so the UI
        // can show AI features without duplicating secrets in runtime-settings.json.
        for (const key of this.allowedKeys) {
            if (env[key] !== undefined) continue;
            const fromProcess = process.env[key];
            if (fromProcess === undefined || String(fromProcess).trim() === '') continue;
            env[key] = this.sensitiveKeys.includes(key) ? this.maskValue(fromProcess) : fromProcess;
        }

        return env;
    }

    async updateEnv(updates: Record<string, string>): Promise<void> {
        let stored: Record<string, string> = {};
        if (await fs.pathExists(RUNTIME_SETTINGS_PATH)) {
            stored = (await fs.readJson(RUNTIME_SETTINGS_PATH)) as Record<string, string>;
        }

        for (const key of this.allowedKeys) {
            if (updates[key] === undefined) continue;
            if (this.sensitiveKeys.includes(key) && updates[key].includes('***')) {
                continue;
            }
            stored[key] = updates[key];
        }

        await fs.ensureDir(path.dirname(RUNTIME_SETTINGS_PATH));
        await fs.writeJson(RUNTIME_SETTINGS_PATH, stored, { spaces: 2 });

        for (const key of this.allowedKeys) {
            if (updates[key] === undefined) continue;
            if (this.sensitiveKeys.includes(key) && updates[key].includes('***')) {
                continue;
            }
            process.env[key] = updates[key];
        }
        if (process.env.GOOGLE_DRIVE_FOLDER_ID === undefined && process.env.DRIVE_FOLDER_ID) {
            process.env.GOOGLE_DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
        }
    }

    async getDashboardConfig(): Promise<DashboardConfig> {
        try {
            await fs.ensureDir(path.dirname(DASHBOARD_CONFIG_PATH));
            if (!(await fs.pathExists(DASHBOARD_CONFIG_PATH))) {
                return DEFAULT_DASHBOARD_CONFIG;
            }
            const content = (await fs.readJson(DASHBOARD_CONFIG_PATH)) as Partial<DashboardConfig>;
            const merged = { ...DEFAULT_DASHBOARD_CONFIG, ...content };
            if (!Array.isArray(merged.customCharts)) {
                merged.customCharts = DEFAULT_DASHBOARD_CONFIG.customCharts;
            }
            return merged;
        } catch (error) {
            console.error('Error reading backend dashboard config:', error);
            return DEFAULT_DASHBOARD_CONFIG;
        }
    }

    async updateDashboardConfig(updates: Partial<DashboardConfig>): Promise<DashboardConfig> {
        const current = await this.getDashboardConfig();
        const updated = { ...current, ...updates };
        await fs.ensureDir(path.dirname(DASHBOARD_CONFIG_PATH));
        await fs.writeJson(DASHBOARD_CONFIG_PATH, updated, { spaces: 2 });
        return updated;
    }

    restart(): void {
        console.log('Restarting server as requested...');

        // In development, nodemon watches src/**/*.ts,json. Touching a watched
        // file triggers a clean restart; exiting would leave nodemon waiting.
        if (process.env.NODEMON === 'true') {
            fs.writeJsonSync(RESTART_TRIGGER_PATH, { requestedAt: new Date().toISOString() });
            return;
        }

        // Electron desktop shell: parent process respawns the Node child on this exit code.
        if (process.env.ELECTRON_MANAGED_SERVER === '1') {
            setTimeout(() => {
                process.exit(88);
            }, 500);
            return;
        }

        // In Docker, PID 1 is node — exiting stops the container unless a restart policy
        // is set. docker-entrypoint.sh loops on exit 42 so we restart in-container.
        // Outside Docker, exit 1 keeps on-failure / PM2-style supervisors working.
        const inDockerImage =
            process.env.RUN_IN_DOCKER === '1' || existsSync('/.dockerenv');
        const exitCode = inDockerImage ? 42 : 1;
        setTimeout(() => {
            process.exit(exitCode);
        }, 500);
    }

    private maskValue(value: string): string {
        if (!value || value.length < 8) return '********';
        return `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
    }
}
