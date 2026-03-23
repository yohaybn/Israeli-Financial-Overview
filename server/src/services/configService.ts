import fs from 'fs-extra';
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
        if (!(await fs.pathExists(RUNTIME_SETTINGS_PATH))) {
            return {};
        }

        const stored = (await fs.readJson(RUNTIME_SETTINGS_PATH)) as Record<string, string>;
        const env: Record<string, string> = {};

        for (const key of this.allowedKeys) {
            const value = stored[key];
            if (value === undefined) continue;
            env[key] = this.sensitiveKeys.includes(key) ? this.maskValue(value) : value;
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
            const content = await fs.readJson(DASHBOARD_CONFIG_PATH);
            return { ...DEFAULT_DASHBOARD_CONFIG, ...content };
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

        setTimeout(() => {
            // Exit non-zero so supervisors configured with on-failure also restart us.
            process.exit(1);
        }, 500);
    }

    private maskValue(value: string): string {
        if (!value || value.length < 8) return '********';
        return `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
    }
}
