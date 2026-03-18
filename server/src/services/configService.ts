import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../../../.env');
const RESTART_TRIGGER_PATH = path.resolve(__dirname, '../restart-trigger.json');

export class ConfigService {
    private readonly allowedKeys = [
        'DRIVE_FOLDER_ID',
        'GEMINI_API_KEY',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REDIRECT_URI',
        'PORT',
        'DATA_DIR',
        'ENCRYPTION_KEY'
    ];

    private readonly sensitiveKeys = [
        'GEMINI_API_KEY',
        'GOOGLE_CLIENT_SECRET',
        'ENCRYPTION_KEY'
    ];

    async getEnv(): Promise<Record<string, string>> {
        if (!(await fs.pathExists(ENV_PATH))) {
            return {};
        }

        const content = await fs.readFile(ENV_PATH, 'utf8');
        const env: Record<string, string> = {};

        content.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && this.allowedKeys.includes(key.trim())) {
                const value = valueParts.join('=').trim();
                env[key.trim()] = this.sensitiveKeys.includes(key.trim())
                    ? this.maskValue(value)
                    : value;
            }
        });

        return env;
    }

    async updateEnv(updates: Record<string, string>): Promise<void> {
        let content = '';
        if (await fs.pathExists(ENV_PATH)) {
            content = await fs.readFile(ENV_PATH, 'utf8');
        }

        const lines = content.split('\n');
        const newLines: string[] = [];
        const seenKeys = new Set<string>();

        // Process existing lines
        lines.forEach(line => {
            const [key] = line.split('=');
            const trimmedKey = key?.trim();
            if (trimmedKey && this.allowedKeys.includes(trimmedKey)) {
                if (updates[trimmedKey] !== undefined) {
                    // If it's a sensitive key and the value is masked, don't update it
                    if (this.sensitiveKeys.includes(trimmedKey) && updates[trimmedKey].includes('***')) {
                        newLines.push(line);
                    } else {
                        newLines.push(`${trimmedKey}=${updates[trimmedKey]}`);
                    }
                    seenKeys.add(trimmedKey);
                } else {
                    newLines.push(line);
                    seenKeys.add(trimmedKey);
                }
            } else if (line.trim()) {
                newLines.push(line);
            }
        });

        // Add new keys
        Object.entries(updates).forEach(([key, value]) => {
            if (this.allowedKeys.includes(key) && !seenKeys.has(key)) {
                newLines.push(`${key}=${value}`);
            }
        });

        await fs.writeFile(ENV_PATH, newLines.join('\n'), 'utf8');
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
