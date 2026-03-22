import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const SECURITY_DIR = path.join(DATA_DIR, 'security');
const LOCK_FILE = path.join(SECURITY_DIR, 'app-lock.json');

const SCRYPT_PARAMS = {
    scryptN: 16384,
    scryptR: 8,
    scryptP: 1,
    keylen: 64
} as const;

/** v2 adds encSalt for deriving the profile encryption key from the same password */
export type LockFileV2 = {
    version: 2;
    salt: string;
    hash: string;
    encSalt: string;
    scryptN: number;
    scryptR: number;
    scryptP: number;
    keylen: number;
};

export function deriveProfileEncryptionKey(password: string, encSaltHex: string): Buffer {
    const salt = Buffer.from(encSaltHex, 'hex');
    return crypto.scryptSync(password, salt, 32, {
        N: SCRYPT_PARAMS.scryptN,
        r: SCRYPT_PARAMS.scryptR,
        p: SCRYPT_PARAMS.scryptP
    });
}

export class AppLockService {
    /** In-memory unlock (lost on restart). When lock file exists, scrapes/profile-create require this. */
    private memoryUnlocked = false;

    /** AES-256 key derived from app password (only while unlocked). */
    private profileEncryptionKey: Buffer | null = null;

    isLockConfigured(): boolean {
        return fs.existsSync(LOCK_FILE);
    }

    /** When no lock file, nothing is gated by app password. */
    isUnlocked(): boolean {
        if (!this.isLockConfigured()) {
            return true;
        }
        return this.memoryUnlocked;
    }

    setUnlocked(value: boolean): void {
        this.memoryUnlocked = value;
    }

    getProfileEncryptionKey(): Buffer | null {
        return this.profileEncryptionKey;
    }

    private readLockFileRaw(): any | null {
        try {
            if (!fs.existsSync(LOCK_FILE)) {
                return null;
            }
            return fs.readJsonSync(LOCK_FILE);
        } catch {
            return null;
        }
    }

    private hashPassword(password: string, salt: Buffer, meta: { scryptN: number; scryptR: number; scryptP: number; keylen: number }): Buffer {
        return crypto.scryptSync(password, salt, meta.keylen, {
            N: meta.scryptN,
            r: meta.scryptR,
            p: meta.scryptP
        });
    }

    verifyPassword(password: string): boolean {
        const raw = this.readLockFileRaw();
        if (!raw?.salt || !raw?.hash) {
            return false;
        }
        const meta = {
            scryptN: raw.scryptN ?? SCRYPT_PARAMS.scryptN,
            scryptR: raw.scryptR ?? SCRYPT_PARAMS.scryptR,
            scryptP: raw.scryptP ?? SCRYPT_PARAMS.scryptP,
            keylen: raw.keylen ?? SCRYPT_PARAMS.keylen
        };
        const salt = Buffer.from(raw.salt, 'hex');
        const expected = Buffer.from(raw.hash, 'hex');
        let derived: Buffer;
        try {
            derived = this.hashPassword(password, salt, meta);
        } catch {
            return false;
        }
        if (expected.length !== derived.length) {
            return false;
        }
        return crypto.timingSafeEqual(expected, derived);
    }

    /** First-time: create lock file v2 with encSalt. */
    setupPassword(password: string): { ok: boolean; error?: string } {
        if (password.length < 8) {
            return { ok: false, error: 'Password must be at least 8 characters' };
        }
        if (this.isLockConfigured()) {
            return { ok: false, error: 'App lock is already configured' };
        }
        fs.ensureDirSync(SECURITY_DIR);
        const salt = crypto.randomBytes(32);
        const encSalt = crypto.randomBytes(32);
        const meta: LockFileV2 = {
            version: 2,
            salt: salt.toString('hex'),
            hash: '',
            encSalt: encSalt.toString('hex'),
            scryptN: SCRYPT_PARAMS.scryptN,
            scryptR: SCRYPT_PARAMS.scryptR,
            scryptP: SCRYPT_PARAMS.scryptP,
            keylen: SCRYPT_PARAMS.keylen
        };
        meta.hash = this.hashPassword(password, salt, meta).toString('hex');
        fs.writeJsonSync(LOCK_FILE, meta, { spaces: 2 });
        this.profileEncryptionKey = deriveProfileEncryptionKey(password, meta.encSalt);
        this.memoryUnlocked = true;
        return { ok: true };
    }

    /**
     * Ensure lock file has encSalt (upgrade v1 → v2). Call only after verifyPassword.
     */
    private ensureEncSaltInLockFile(): string {
        const raw = this.readLockFileRaw();
        if (!raw) {
            throw new Error('Lock file missing');
        }
        if (raw.encSalt && typeof raw.encSalt === 'string') {
            return raw.encSalt;
        }
        const encSalt = crypto.randomBytes(32).toString('hex');
        const next = {
            ...raw,
            version: 2,
            encSalt
        };
        fs.writeJsonSync(LOCK_FILE, next, { spaces: 2 });
        return encSalt;
    }

    tryUnlock(password: string): boolean {
        if (!this.isLockConfigured()) {
            this.memoryUnlocked = true;
            this.profileEncryptionKey = null;
            return true;
        }
        if (!this.verifyPassword(password)) {
            return false;
        }
        const encSalt = this.ensureEncSaltInLockFile();
        this.profileEncryptionKey = deriveProfileEncryptionKey(password, encSalt);
        this.memoryUnlocked = true;
        return true;
    }

    lock(): void {
        this.memoryUnlocked = false;
        if (this.profileEncryptionKey) {
            this.profileEncryptionKey.fill(0);
            this.profileEncryptionKey = null;
        }
    }
}

export const appLockService = new AppLockService();
