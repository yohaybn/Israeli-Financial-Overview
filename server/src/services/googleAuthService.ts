import { google } from 'googleapis';
import path from 'path';
import fs from 'fs-extra';
import { serverLogger } from '../utils/logger';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const TOKENS_PATH = path.join(DATA_DIR, 'config', 'google_tokens.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'config', 'google_settings.json');

export interface GoogleSettings {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export class GoogleAuthService {
    private oauth2Client: any;
    private settings: GoogleSettings | null = null;

    constructor() {
        this.initialize();
    }

    private async initialize() {
        await this.loadSettings();
        this.setupClient();
    }

    private async loadSettings() {
        if (await fs.pathExists(SETTINGS_PATH)) {
            this.settings = await fs.readJson(SETTINGS_PATH);
        } else {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
            if (clientId && clientSecret) {
                this.settings = {
                    clientId,
                    clientSecret,
                    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
                };
            }
        }
    }

    private setupClient() {
        if (this.settings) {
            this.oauth2Client = new google.auth.OAuth2(
                this.settings.clientId,
                this.settings.clientSecret,
                this.settings.redirectUri
            );
        } else {
            // Fallback empty client or just log warning
            this.oauth2Client = new google.auth.OAuth2();
            serverLogger.warn('Google OAuth credentials not configured.');
        }
    }

    async getSettings(): Promise<GoogleSettings | null> {
        await this.loadSettings();
        return this.settings;
    }

    async updateSettings(newSettings: GoogleSettings) {
        try {
            serverLogger.info('Updating Google OAuth settings...', { clientId: newSettings.clientId });
            this.settings = newSettings;

            serverLogger.info(`Ensuring directory exists: ${DATA_DIR}`);
            const CONFIG_DIR = path.join(DATA_DIR, 'config');
            await fs.ensureDir(CONFIG_DIR);

            serverLogger.info(`Writing settings to: ${SETTINGS_PATH}`);
            await fs.writeJson(SETTINGS_PATH, this.settings, { spaces: 2 });

            serverLogger.info('Setting up OAuth2 client...');
            this.setupClient();

            serverLogger.info('Google OAuth settings updated and saved successfully.');
        } catch (error: any) {
            serverLogger.error('Error in updateSettings:', { error: error.message, stack: error.stack });
            throw error;
        }
    }

    async isConfigured() {
        await this.loadSettings();
        return !!this.settings?.clientId && !!this.settings?.clientSecret;
    }

    async getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
        });
    }

    async setTokensFromCode(code: string) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            await this.saveTokens(tokens);
            serverLogger.info('Google OAuth tokens successfully exchanged and saved.');
            return tokens;
        } catch (error: any) {
            serverLogger.error('Failed to exchange Google OAuth code for tokens:', error);
            throw error;
        }
    }

    async isAuthenticated() {
        try {
            const tokens = await this.loadTokens();
            if (!tokens) return false;

            this.oauth2Client.setCredentials(tokens);

            // Check if token is expired and refresh if necessary
            // The googleapis library handles refresh automatically if refresh_token is present
            // but we might want to verify if it's still valid.
            return true;
        } catch (error) {
            return false;
        }
    }

    async getClient() {
        const tokens = await this.loadTokens();
        if (tokens) {
            this.oauth2Client.setCredentials(tokens);
        }
        return this.oauth2Client;
    }

    private async saveTokens(tokens: any) {
        const CONFIG_DIR = path.join(DATA_DIR, 'config');
        await fs.ensureDir(CONFIG_DIR);
        await fs.writeJson(TOKENS_PATH, tokens, { spaces: 2 });
    }

    private async loadTokens() {
        if (await fs.pathExists(TOKENS_PATH)) {
            return await fs.readJson(TOKENS_PATH);
        }
        return null;
    }

    async revokeAuth() {
        if (await fs.pathExists(TOKENS_PATH)) {
            await fs.remove(TOKENS_PATH);
            serverLogger.info('Google OAuth tokens revoked locally.');
        }
    }
}
