import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

export const OAUTH_CREDENTIALS_PATH = path.join(APP_ROOT, 'oauth-credentials.json');
export const PROFILES_PATH = path.join(APP_ROOT, 'profiles.json');
export const RESULTS_DIR = path.join(APP_ROOT, 'results');
export const SETTINGS_PATH = path.join(APP_ROOT, 'settings.json');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

export function getAuthConfig() {
    // Read OAuth credentials from file
    if (fs.existsSync(OAUTH_CREDENTIALS_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(OAUTH_CREDENTIALS_PATH, 'utf8'));
        } catch (e) {
            console.error('Error reading oauth creds', e);
        }
    }
    return null;
}



export function getSettings() {
    // 1. Try Environment Variables (as JSON string)
    if (process.env.SETTINGS_JSON) {
        try {
            return JSON.parse(process.env.SETTINGS_JSON);
        } catch (e) {
            console.error('Error parsing SETTINGS_JSON env var', e);
        }
    }

    // 2. Try File
    if (fs.existsSync(SETTINGS_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        } catch (e) {
            console.error('Error reading settings', e);
        }
    }

    // 3. Fallback to individual env vars for specific settings
    const settings = {};
    if (process.env.APP_SECRET) {
        settings.appSecret = process.env.APP_SECRET;
    }
    // Add other individual env var overrides here if needed

    return settings;
}

export function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('Error saving settings', e);
    }
}

// AI Config
import { encrypt, decrypt } from './encryption.js';

// Fallback secret if env var not set - STRICTLY WARN if using fallback
let _cachedSecret = null;

export function getAppSecret() {
    if (_cachedSecret) return _cachedSecret;

    // Use process.env.APP_SECRET directly here, lazily
    let secret = process.env.APP_SECRET;

    if (!secret) {
        console.error(`
    ################################################################################
    #  CRITICAL SECURITY WARNING: APP_SECRET is not set!                           #
    #  Using a temporary random secret. Encrypted data will be LOST on restart.    #
    #  Please set APP_SECRET in your environment variables or .env file.           #
    ################################################################################
        `);
        secret = 'TEMP_SECRET_' + Math.random().toString(36).slice(2) + Date.now();
    }

    _cachedSecret = secret;
    return secret;
}

export function getAiConfig() {
    const settings = getSettings();
    if (settings.ai) {
        return settings.ai;
    }
    return {};
}

export function saveAiConfig(config) {
    const current = getSettings();
    const newAi = { ...current.ai, ...config };

    // Encrypt key if it's being updated and is not already masked/encrypted
    if (config.apiKey && !config.apiKey.startsWith('iv:')) {
        const secret = getAppSecret();
        const encrypted = encrypt(config.apiKey, secret);
        newAi.apiKey = JSON.stringify(encrypted);
    }

    saveSettings({ ...current, ai: newAi });
}
