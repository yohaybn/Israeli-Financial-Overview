import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { Profile, mergeProfileCredentialsOnUpdate } from '@app/shared';
import { v4 as uuidv4 } from 'uuid';
import { appLockService, SECURITY_DIR } from './appLockService.js';

const PROFILES_DIR = path.resolve(process.env.DATA_DIR || './data', 'profiles');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const MIGRATION_MARKER = path.join(SECURITY_DIR, 'migrated-from-env-key.marker');

export class ProfileService {
    constructor() {
        fs.ensureDirSync(PROFILES_DIR);
    }

    private getLegacyEncryptionKeyFromEnv(): Buffer | null {
        const key = process.env.ENCRYPTION_KEY;
        if (!key) {
            return null;
        }
        try {
            const b = Buffer.from(key, 'hex');
            return b.length === 32 ? b : null;
        } catch {
            return null;
        }
    }

    private getDevFallbackKey(): Buffer {
        return Buffer.from('dev-only-insecure-key-32-bytes-!!', 'utf8');
    }

    private hasEnvMigrationMarker(): boolean {
        return fs.existsSync(MIGRATION_MARKER);
    }

    /** Key for encrypting new credentials (password-derived, legacy env, or dev fallback). */
    private getEncryptionKeyForWrite(): Buffer | null {
        const pk = appLockService.getProfileEncryptionKey();
        if (pk) {
            return pk;
        }

        if (appLockService.isLockConfigured() && !appLockService.isUnlocked()) {
            return null;
        }

        if (!this.hasEnvMigrationMarker()) {
            const legacy = this.getLegacyEncryptionKeyFromEnv();
            if (legacy) {
                return legacy;
            }
        }

        if (!appLockService.isLockConfigured()) {
            return this.getDevFallbackKey();
        }

        return null;
    }

    private encryptWithKey(data: any, key: Buffer): string {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
        const jsonStr = JSON.stringify(data);
        let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    private tryDecryptWithKey(encryptedStr: string, key: Buffer): any {
        const parts = encryptedStr.split(':');
        if (parts.length !== 3) {
            try {
                return JSON.parse(encryptedStr);
            } catch {
                return { _error: 'DECRYPTION_FAILED', _original: encryptedStr };
            }
        }
        try {
            const [ivHex, authTagHex, encryptedDataHex] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch {
            return { _error: 'DECRYPTION_FAILED', _original: encryptedStr };
        }
    }

    private getProfilePath(id: string): string {
        return path.join(PROFILES_DIR, `${id}.json`);
    }

    private encrypt(data: any): string {
        const key = this.getEncryptionKeyForWrite();
        if (!key) {
            throw new Error('Cannot encrypt profile credentials: unlock the app with your password.');
        }
        return this.encryptWithKey(data, key);
    }

    private decrypt(encryptedStr: string): any {
        if (!encryptedStr) {
            return {};
        }

        if (appLockService.isLockConfigured() && !appLockService.isUnlocked()) {
            return { _locked: true };
        }

        const parts = encryptedStr.split(':');

        if (parts.length !== 3) {
            try {
                return JSON.parse(encryptedStr);
            } catch {
                return {};
            }
        }

        const keys: Buffer[] = [];
        const pk = appLockService.getProfileEncryptionKey();
        if (pk) {
            keys.push(pk);
        }
        if (!this.hasEnvMigrationMarker()) {
            const legacy = this.getLegacyEncryptionKeyFromEnv();
            if (legacy) {
                keys.push(legacy);
            }
        }
        // Pre-lock / dev-only installs used the constant dev key; try last after password & legacy env
        keys.push(this.getDevFallbackKey());

        const seen = new Set<string>();
        for (const key of keys) {
            const id = key.toString('hex');
            if (seen.has(id)) continue;
            seen.add(id);
            const result = this.tryDecryptWithKey(encryptedStr, key);
            if (!result?._error) {
                return result;
            }
        }

        console.error('Decryption failed: profile credentials could not be decrypted with available keys.');

        return { _error: 'DECRYPTION_FAILED', _original: encryptedStr };
    }

    async getProfiles(): Promise<Profile[]> {
        const files = await fs.readdir(PROFILES_DIR);
        const profiles: Profile[] = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const content = await fs.readJson(path.join(PROFILES_DIR, file));

                if (typeof content.credentials === 'string') {
                    content.credentials = this.decrypt(content.credentials);
                }

                profiles.push(content);
            } catch (e) {
                console.error(`Failed to read profile ${file}:`, e);
            }
        }

        return profiles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    async getProfile(id: string): Promise<Profile | null> {
        const filePath = this.getProfilePath(id);
        if (!(await fs.pathExists(filePath))) {
            return null;
        }
        const profile = await fs.readJson(filePath);

        if (typeof profile.credentials === 'string') {
            profile.credentials = this.decrypt(profile.credentials);
        }

        return profile;
    }

    async createProfile(data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): Promise<Profile> {
        const now = new Date().toISOString();

        const encryptedCredentials = this.encrypt(data.credentials);

        const profileToSave = {
            ...data,
            credentials: encryptedCredentials,
            id: uuidv4(),
            createdAt: now,
            updatedAt: now
        };

        await fs.writeJson(this.getProfilePath(profileToSave.id), profileToSave, { spaces: 2 });

        return {
            ...profileToSave,
            credentials: data.credentials
        } as Profile;
    }

    async updateProfile(id: string, data: Partial<Omit<Profile, 'id' | 'createdAt'>>): Promise<Profile | null> {
        const existing = await this.getProfile(id);
        if (!existing) {
            return null;
        }

        if (data.companyId !== undefined && data.companyId !== existing.companyId) {
            throw new Error('Changing the provider for a saved profile is not supported.');
        }

        const companyId = existing.companyId;
        const mergedCredentials = mergeProfileCredentialsOnUpdate(
            existing.credentials,
            data.credentials,
            companyId
        );

        const updatedData = {
            ...existing,
            ...data,
            companyId,
            credentials: mergedCredentials
        };

        const now = new Date().toISOString();

        const encryptedCredentials = this.encrypt(updatedData.credentials);

        const profileToSave = {
            ...updatedData,
            credentials: encryptedCredentials,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: now
        };

        await fs.writeJson(this.getProfilePath(id), profileToSave, { spaces: 2 });

        return {
            ...profileToSave,
            credentials: updatedData.credentials
        } as Profile;
    }

    async deleteProfile(id: string): Promise<boolean> {
        const filePath = this.getProfilePath(id);
        if (!(await fs.pathExists(filePath))) {
            return false;
        }
        await fs.remove(filePath);
        return true;
    }

    /**
     * One-time: re-encrypt profiles that were encrypted with the env-based key to the password-derived key.
     * Requires successful unlock so password key is in memory. Safe to call after every unlock.
     */
    async migrateFromEnvIfNeeded(): Promise<{ migrated: number; skipped: boolean }> {
        if (this.hasEnvMigrationMarker()) {
            return { migrated: 0, skipped: true };
        }

        const legacy = this.getLegacyEncryptionKeyFromEnv();
        if (!legacy) {
            return { migrated: 0, skipped: true };
        }

        const passwordKey = appLockService.getProfileEncryptionKey();
        if (!passwordKey) {
            return { migrated: 0, skipped: true };
        }

        fs.ensureDirSync(SECURITY_DIR);
        const files = await fs.readdir(PROFILES_DIR);
        let migrated = 0;
        let failed = 0;

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const p = path.join(PROFILES_DIR, file);
            const content = await fs.readJson(p);
            if (typeof content.credentials !== 'string') {
                continue;
            }

            let plain = this.tryDecryptWithKey(content.credentials, passwordKey);
            if (!plain?._error) {
                continue;
            }

            plain = this.tryDecryptWithKey(content.credentials, legacy);
            if (plain?._error) {
                console.error(`Migration: could not decrypt profile ${file} with legacy or password key`);
                failed++;
                continue;
            }

            content.credentials = this.encryptWithKey(plain, passwordKey);
            await fs.writeJson(p, content, { spaces: 2 });
            migrated++;
        }

        if (failed > 0) {
            console.error(
                `Profile encryption migration incomplete: ${failed} file(s) could not be decrypted. Restore from backup or fix profile encryption keys, then unlock again.`
            );
            return { migrated, skipped: false };
        }

        await fs.writeFile(MIGRATION_MARKER, new Date().toISOString(), 'utf8');
        if (migrated > 0) {
            console.log(`✅ Profile encryption: migrated ${migrated} profile(s) to app password key.`);
        } else {
            console.log('✅ Profile encryption: migration marker written (no legacy-encrypted profiles found).');
        }

        return { migrated, skipped: false };
    }
}

export const profileService = new ProfileService();
