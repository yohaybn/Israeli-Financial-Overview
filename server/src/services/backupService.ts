import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import { google } from 'googleapis';
import { GoogleAuthService } from './googleAuthService.js';
import { DbService, closeDbForRestore } from './dbService.js';
import { RUNTIME_SETTINGS_PATH } from '../runtimeEnv.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const GOOGLE_FOLDER_CONFIG_PATH = path.join(CONFIG_DIR, 'google_folder.json');
const DB_PATH = path.join(DATA_DIR, 'app.db');

const SNAPSHOT_VERSION = 3;
const SUPPORTED_SNAPSHOT_VERSIONS = [1, 2, 3];
const SNAPSHOT_NAME_PREFIX = 'bank-scraper-backup';
const BACKUP_EXT = '.backup.json';

const BACKUP_TARGETS = [
    'results',
    'config',
    'profiles',
    'post_scrape'
];

/** Optional JSON files stored directly under DATA_DIR (not in a subfolder). */
const DATA_DIR_ROOT_CONFIG_FILES = ['scheduler_config.json', 'notification_config.json'] as const;

/** Snapshot path for project-root runtime-settings.json (API keys, OAuth client id/secret, etc.). */
const RUNTIME_SETTINGS_SNAPSHOT_PATH = 'root/runtime-settings.json';

interface BackupEntry {
    path: string;
    encoding: 'base64';
    content: string;
}

interface BackupSnapshot {
    version: number;
    createdAt: string;
    files: BackupEntry[];
}

export class BackupService {
    private authService: GoogleAuthService;

    constructor() {
        this.authService = new GoogleAuthService();
    }

    private getBackupFileName() {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `${SNAPSHOT_NAME_PREFIX}-${stamp}${BACKUP_EXT}`;
    }

    private resolveSafeRelativePath(relativePath: string) {
        const normalized = relativePath.replace(/\\/g, '/');
        if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
            throw new Error(`Invalid snapshot path: ${relativePath}`);
        }
        return normalized;
    }

    /**
     * Recursively collect all files under a directory. `relativePrefix` uses POSIX segments (e.g. "config").
     */
    private async collectDirRecursive(absoluteDir: string, relativePrefix: string): Promise<BackupEntry[]> {
        const entries: BackupEntry[] = [];
        if (!(await fs.pathExists(absoluteDir))) {
            return entries;
        }
        const names = await fs.readdir(absoluteDir);
        for (const name of names) {
            const abs = path.join(absoluteDir, name);
            const stat = await fs.stat(abs);
            const rel = path.posix.join(relativePrefix.replace(/\\/g, '/'), name);
            if (stat.isDirectory()) {
                entries.push(...(await this.collectDirRecursive(abs, rel)));
            } else if (stat.isFile()) {
                const relativePath = this.resolveSafeRelativePath(rel);
                const buffer = await fs.readFile(abs);
                entries.push({
                    path: relativePath,
                    encoding: 'base64',
                    content: buffer.toString('base64')
                });
            }
        }
        return entries;
    }

    private async collectSnapshotFiles(): Promise<BackupEntry[]> {
        const entries: BackupEntry[] = [];

        for (const target of BACKUP_TARGETS) {
            const targetPath = path.join(DATA_DIR, target);
            entries.push(...(await this.collectDirRecursive(targetPath, target)));
        }

        for (const name of DATA_DIR_ROOT_CONFIG_FILES) {
            const abs = path.join(DATA_DIR, name);
            if (!(await fs.pathExists(abs))) continue;
            const stat = await fs.stat(abs);
            if (!stat.isFile()) continue;
            const relativePath = this.resolveSafeRelativePath(name);
            const buffer = await fs.readFile(abs);
            entries.push({
                path: relativePath,
                encoding: 'base64',
                content: buffer.toString('base64')
            });
        }

        if (await fs.pathExists(RUNTIME_SETTINGS_PATH)) {
            const stat = await fs.stat(RUNTIME_SETTINGS_PATH);
            if (stat.isFile()) {
                const buffer = await fs.readFile(RUNTIME_SETTINGS_PATH);
                entries.push({
                    path: RUNTIME_SETTINGS_SNAPSHOT_PATH,
                    encoding: 'base64',
                    content: buffer.toString('base64')
                });
            }
        }

        // Include the SQLite database file
        if (await fs.pathExists(DB_PATH)) {
            // Checkpoint WAL to flush all changes into the main DB file
            try {
                const dbService = new DbService();
                dbService.checkpoint();
                dbService.close();
            } catch {
                // If checkpoint fails, still try to include the DB file as-is
            }

            const buffer = await fs.readFile(DB_PATH);
            entries.push({
                path: 'app.db',
                encoding: 'base64',
                content: buffer.toString('base64')
            });
        }

        return entries;
    }

    private async buildSnapshot(): Promise<BackupSnapshot> {
        const files = await this.collectSnapshotFiles();
        return {
            version: SNAPSHOT_VERSION,
            createdAt: new Date().toISOString(),
            files
        };
    }

    private async getDriveFolderId(): Promise<string | undefined> {
        if (await fs.pathExists(GOOGLE_FOLDER_CONFIG_PATH)) {
            try {
                const cfg = await fs.readJson(GOOGLE_FOLDER_CONFIG_PATH);
                if (cfg?.folderId) {
                    return cfg.folderId;
                }
            } catch {
                // ignore malformed config and fallback to env
            }
        }

        return process.env.GOOGLE_DRIVE_FOLDER_ID;
    }

    async createLocalBackup(): Promise<{ filename: string; path: string }> {
        await fs.ensureDir(BACKUPS_DIR);
        const snapshot = await this.buildSnapshot();
        const filename = this.getBackupFileName();
        const outputPath = path.join(BACKUPS_DIR, filename);
        await fs.writeJson(outputPath, snapshot, { spaces: 2 });
        return { filename, path: outputPath };
    }

    async listLocalBackups() {
        await fs.ensureDir(BACKUPS_DIR);
        const files = await fs.readdir(BACKUPS_DIR);
        const backups = [];

        for (const file of files) {
            if (!file.endsWith(BACKUP_EXT)) continue;
            const fullPath = path.join(BACKUPS_DIR, file);
            const stat = await fs.stat(fullPath);
            backups.push({
                filename: file,
                size: stat.size,
                createdAt: stat.birthtime.toISOString()
            });
        }

        backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return backups;
    }

    getLocalBackupPath(filename: string): string {
        const safeName = path.basename(filename);
        const fullPath = path.join(BACKUPS_DIR, safeName);
        const resolved = path.resolve(fullPath);
        if (!resolved.startsWith(path.resolve(BACKUPS_DIR))) {
            throw new Error('Invalid backup filename');
        }
        return resolved;
    }

    async uploadLatestSnapshotToGoogleDrive(localPath: string, folderId?: string) {
        const auth = await this.authService.getClient();
        const drive = google.drive({ version: 'v3', auth });
        const fileName = path.basename(localPath);
        const content = await fs.readFile(localPath);

        const finalFolderId = folderId || await this.getDriveFolderId();
        const requestBody: any = { name: fileName };
        if (finalFolderId) {
            requestBody.parents = [finalFolderId];
        }

        const response = await drive.files.create({
            requestBody,
            media: {
                mimeType: 'application/json',
                body: Readable.from(content)
            },
            fields: 'id,name,createdTime,size,webViewLink'
        });

        return response.data;
    }

    async listDriveBackups(folderId?: string) {
        const auth = await this.authService.getClient();
        const drive = google.drive({ version: 'v3', auth });
        const finalFolderId = folderId || await this.getDriveFolderId();

        let q = `name contains '${SNAPSHOT_NAME_PREFIX}' and mimeType='application/json' and trashed=false`;
        if (finalFolderId) {
            q += ` and '${finalFolderId}' in parents`;
        }

        const response = await drive.files.list({
            q,
            fields: 'files(id,name,createdTime,size,webViewLink)',
            pageSize: 100,
            orderBy: 'createdTime desc'
        });

        return response.data.files || [];
    }

    /**
     * Restore from a backup snapshot.
     * Returns true if the snapshot contained a DB file (v2+), false otherwise (v1).
     * When a DB file is included, the caller should NOT rebuild the DB from files.
     */
    private async restoreFromSnapshot(snapshot: BackupSnapshot): Promise<boolean> {
        if (!snapshot || !SUPPORTED_SNAPSHOT_VERSIONS.includes(snapshot.version) || !Array.isArray(snapshot.files)) {
            throw new Error('Invalid backup snapshot format');
        }

        // Check if snapshot includes a DB file
        const hasDbFile = snapshot.files.some(e => e.path === 'app.db');

        for (const target of BACKUP_TARGETS) {
            await fs.ensureDir(path.join(DATA_DIR, target));
            await fs.emptyDir(path.join(DATA_DIR, target));
        }

        // If restoring a DB file, close the shared connection so the file is not locked, then remove old DB files
        if (hasDbFile) {
            closeDbForRestore();
            for (const dbFile of ['app.db', 'app.db-shm', 'app.db-wal']) {
                const dbPath = path.join(DATA_DIR, dbFile);
                if (await fs.pathExists(dbPath)) {
                    await fs.remove(dbPath);
                }
            }
        }

        for (const entry of snapshot.files) {
            const content = Buffer.from(entry.content, 'base64');

            if (entry.path === RUNTIME_SETTINGS_SNAPSHOT_PATH) {
                await fs.ensureDir(path.dirname(RUNTIME_SETTINGS_PATH));
                await fs.writeFile(RUNTIME_SETTINGS_PATH, content);
                continue;
            }

            const relativePath = this.resolveSafeRelativePath(entry.path);
            const outputPath = path.join(DATA_DIR, relativePath);
            const outputDir = path.dirname(outputPath);
            await fs.ensureDir(outputDir);
            await fs.writeFile(outputPath, content);
        }

        return hasDbFile;
    }

    async restoreFromLocalBackup(filename: string): Promise<boolean> {
        const resolved = this.getLocalBackupPath(filename);
        if (!await fs.pathExists(resolved)) {
            throw new Error('Backup file not found');
        }

        const snapshot = await fs.readJson(resolved) as BackupSnapshot;
        return await this.restoreFromSnapshot(snapshot);
    }

    async restoreFromDriveBackup(fileId: string): Promise<boolean> {
        const auth = await this.authService.getClient();
        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        const raw = Buffer.from(response.data as ArrayBuffer).toString('utf8');
        const snapshot = JSON.parse(raw) as BackupSnapshot;
        return await this.restoreFromSnapshot(snapshot);
    }

    async restoreFromUploadedBackup(filePath: string): Promise<boolean> {
        const snapshot = await fs.readJson(filePath) as BackupSnapshot;
        return await this.restoreFromSnapshot(snapshot);
    }
}
