import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { Profile } from '@app/shared';
import { v4 as uuidv4 } from 'uuid';

const PROFILES_DIR = path.resolve(process.env.DATA_DIR || './data', 'profiles');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

export class ProfileService {
    private encryptionKey: Buffer;

    constructor() {
        // Ensure profiles directory exists
        fs.ensureDirSync(PROFILES_DIR);

        // Load encryption key from environment
        const key = process.env.ENCRYPTION_KEY;
        if (!key) {
            console.error('❌ ERROR: ENCRYPTION_KEY not set in .env! Saved profiles will not be securely stored.');
            // Fallback to a stable but insecure key based on a system property or just use a constant for dev
            // This is better than a random key on every restart which corrupts data
            this.encryptionKey = Buffer.from('dev-only-insecure-key-32-bytes-!!', 'utf8');
        } else {
            // Key should be 32 bytes for AES-256
            try {
                this.encryptionKey = Buffer.from(key, 'hex');
                if (this.encryptionKey.length !== 32) {
                    throw new Error(`ENCRYPTION_KEY must be 32 bytes (64 hex characters), but got ${this.encryptionKey.length} bytes.`);
                }
                console.log('✅ Encryption key loaded successfully.');
            } catch (error: any) {
                console.error('❌ Invalid ENCRYPTION_KEY format. Expected 64-character hex string.');
                this.encryptionKey = Buffer.from('dev-only-insecure-key-32-bytes-!!', 'utf8');
            }
        }
    }

    private getProfilePath(id: string): string {
        return path.join(PROFILES_DIR, `${id}.json`);
    }

    private encrypt(data: any): string {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

        const jsonStr = JSON.stringify(data);
        let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');

        // Format: iv:authTag:encryptedData
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    private decrypt(encryptedStr: string): any {
        if (!encryptedStr) return {};

        const parts = encryptedStr.split(':');

        // If it doesn't look like our encrypted format, try to parse as plain JSON
        if (parts.length !== 3) {
            try {
                return JSON.parse(encryptedStr);
            } catch (e) {
                // If it's not JSON and not encrypted, it's garbage
                return {};
            }
        }

        try {
            const [ivHex, authTagHex, encryptedDataHex] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (e: any) {
            // Decryption failed (usually wrong key/corrupted data)
            console.error(`Decryption failed: ${e.message}. The profile might have been encrypted with a different key.`);

            // Return a clear indicator that data is unavailable
            return { _error: 'DECRYPTION_FAILED', _original: encryptedStr };
        }
    }

    async getProfiles(): Promise<Profile[]> {
        const files = await fs.readdir(PROFILES_DIR);
        const profiles: Profile[] = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const content = await fs.readJson(path.join(PROFILES_DIR, file));

                // Decrypt credentials if it's a string (meaning it's encrypted)
                if (typeof content.credentials === 'string') {
                    content.credentials = this.decrypt(content.credentials);
                }

                profiles.push(content);
            } catch (e) {
                console.error(`Failed to read profile ${file}:`, e);
            }
        }

        // Sort by updatedAt descending
        return profiles.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }

    async getProfile(id: string): Promise<Profile | null> {
        const filePath = this.getProfilePath(id);
        if (!await fs.pathExists(filePath)) {
            return null;
        }
        const profile = await fs.readJson(filePath);

        // Decrypt credentials if it's a string
        if (typeof profile.credentials === 'string') {
            profile.credentials = this.decrypt(profile.credentials);
        }

        return profile;
    }

    async createProfile(data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): Promise<Profile> {
        const now = new Date().toISOString();

        // Encrypt credentials before saving
        const encryptedCredentials = this.encrypt(data.credentials);

        const profileToSave = {
            ...data,
            credentials: encryptedCredentials,
            id: uuidv4(),
            createdAt: now,
            updatedAt: now,
        };

        await fs.writeJson(this.getProfilePath(profileToSave.id), profileToSave, { spaces: 2 });

        // Return decrypted version to the client
        return {
            ...profileToSave,
            credentials: data.credentials,
        } as Profile;
    }

    async updateProfile(id: string, data: Partial<Omit<Profile, 'id' | 'createdAt'>>): Promise<Profile | null> {
        const existing = await this.getProfile(id);
        if (!existing) {
            return null;
        }

        const updatedData = {
            ...existing,
            ...data,
        };

        const now = new Date().toISOString();

        // Encrypt credentials before saving
        const encryptedCredentials = this.encrypt(updatedData.credentials);

        const profileToSave = {
            ...updatedData,
            credentials: encryptedCredentials,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: now,
        };

        await fs.writeJson(this.getProfilePath(id), profileToSave, { spaces: 2 });

        // Return decrypted version
        return {
            ...profileToSave,
            credentials: updatedData.credentials,
        } as Profile;
    }

    async deleteProfile(id: string): Promise<boolean> {
        const filePath = this.getProfilePath(id);
        if (!await fs.pathExists(filePath)) {
            return false;
        }
        await fs.remove(filePath);
        return true;
    }
}
