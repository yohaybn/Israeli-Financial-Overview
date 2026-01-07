import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[loadEnv] Loading environment variables...');

// Load from app/.env
const appEnvPath = path.join(__dirname, '.env');
const resultApp = dotenv.config({ path: appEnvPath, override: true });
if (resultApp.error) {
    console.log(`[loadEnv] Failed to load ${appEnvPath}:`, resultApp.error.message);
} else {
    console.log(`[loadEnv] Loaded ${appEnvPath}`);
}

// Load from root .env (fallback)
const rootEnvPath = path.join(__dirname, '../.env');
dotenv.config({ path: rootEnvPath });

// 2. App .env (Override root)
dotenv.config({ path: appEnvPath, override: true });

console.log('[loadEnv] PORT is now:', process.env.PORT);
console.log('[loadEnv] APP_SECRET is present:', !!process.env.APP_SECRET);
