import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import { google } from 'googleapis';
import {
    BACKUP_SCOPE_IDS,
    BACKUP_SNAPSHOT_RUNTIME_SETTINGS_PATH,
    backupEntryPathToScope,
    backupScopesInSnapshot,
    isBackupScopeId,
    type BackupScopeId
} from '@app/shared';
import { GoogleAuthService } from './googleAuthService.js';
import { DbService, closeDbForRestore } from './dbService.js';
import { RUNTIME_SETTINGS_PATH } from '../runtimeEnv.js';

export { BACKUP_SCOPE_IDS, type BackupScopeId };

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const GOOGLE_FOLDER_CONFIG_PATH = path.join(CONFIG_DIR, 'google_folder.json');
const TELEGRAM_CONFIG_PATH = path.join(CONFIG_DIR, 'telegram_config.json');
/** Same relative path as under DATA_DIR; snapshot may merge file + TELEGRAM_BOT_TOKEN env. */
const TELEGRAM_CONFIG_SNAPSHOT_PATH = 'config/telegram_config.json';
const DB_PATH = path.join(DATA_DIR, 'app.db');

const SNAPSHOT_VERSION = 3;
const SUPPORTED_SNAPSHOT_VERSIONS = [1, 2, 3];
const SNAPSHOT_NAME_PREFIX = 'bank-scraper-backup';
const BACKUP_EXT = '.backup.json';

const RUNTIME_SETTINGS_SNAPSHOT_PATH = BACKUP_SNAPSHOT_RUNTIME_SETTINGS_PATH;

const BACKUP_TARGETS = [
    'results',
    'config',
    'profiles',
    /** App lock + migration marker — required to decrypt password-migrated profiles after restore on another machine */
    'security',
    'post_scrape'
];

/** Optional JSON files stored directly under DATA_DIR (not in a subfolder). */
const DATA_DIR_ROOT_CONFIG_FILES = ['scheduler_config.json', 'notification_config.json'] as const;

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

export interface RestoreSnapshotResult {
    /** True if app.db was replaced in this operation */
    dbRestored: boolean;
    /** True when JSON under results/ was written and DB should be rebuilt from files (no DB restore) */
    needsReloadFromFiles: boolean;
}

export interface BackupSnapshotSummary {
    version: number;
    createdAt: string;
    scopes: BackupScopeId[];
    fileCount: number;
}

export function normalizeBackupScopesParam(scopes: unknown): BackupScopeId[] | undefined {
    if (scopes === undefined || scopes === null || scopes === '') {
        return undefined;
    }
    if (typeof scopes === 'string') {
        let parsed: unknown;
        try {
            parsed = JSON.parse(scopes);
        } catch {
            throw new Error('Invalid scopes JSON');
        }
        return normalizeBackupScopesParam(parsed);
    }
    if (!Array.isArray(scopes)) {
        throw new Error('scopes must be an array of scope ids');
    }
    const out: BackupScopeId[] = [];
    for (const s of scopes) {
        if (typeof s !== 'string' || !isBackupScopeId(s)) {
            throw new Error(`Invalid backup scope: ${String(s)}`);
        }
        if (!out.includes(s)) {
            out.push(s);
        }
    }
    if (out.length === 0) {
        throw new Error('Select at least one backup scope, or omit scopes for a full backup');
    }
    return out;
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

    private scopeWanted(scopes: BackupScopeId[] | undefined, id: BackupScopeId): boolean {
        return !scopes || scopes.length === 0 || scopes.includes(id);
    }

    private async collectSnapshotFiles(scopes?: BackupScopeId[]): Promise<BackupEntry[]> {
        const entries: BackupEntry[] = [];

        for (const target of BACKUP_TARGETS) {
            if (!this.scopeWanted(scopes, target as BackupScopeId)) {
                continue;
            }
            const targetPath = path.join(DATA_DIR, target);
            entries.push(...(await this.collectDirRecursive(targetPath, target)));
        }

        if (this.scopeWanted(scopes, 'config')) {
            await this.replaceWithResolvedTelegramConfig(entries);
        }

        if (this.scopeWanted(scopes, 'root_config')) {
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
        }

        if (this.scopeWanted(scopes, 'runtime_settings') && (await fs.pathExists(RUNTIME_SETTINGS_PATH))) {
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

        if (this.scopeWanted(scopes, 'database') && (await fs.pathExists(DB_PATH))) {
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

    /**
     * Ensure telegram_config.json in the snapshot includes the effective bot token and user lists:
     * on-disk file is merged with TELEGRAM_BOT_TOKEN when the token was set only via env.
     */
    private async replaceWithResolvedTelegramConfig(entries: BackupEntry[]): Promise<void> {
        let fromFile: Record<string, unknown> = {};
        if (await fs.pathExists(TELEGRAM_CONFIG_PATH)) {
            try {
                fromFile = (await fs.readJson(TELEGRAM_CONFIG_PATH)) as Record<string, unknown>;
            } catch {
                // keep empty; still allow env-only token in backup
            }
        }

        const fileToken = typeof fromFile.botToken === 'string' ? fromFile.botToken.trim() : '';
        const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
        const botToken = fileToken || envToken;

        const merged = {
            botToken,
            enabled: typeof fromFile.enabled === 'boolean' ? fromFile.enabled : false,
            adminChatIds: Array.isArray(fromFile.adminChatIds) ? fromFile.adminChatIds : [],
            notificationChatIds: Array.isArray(fromFile.notificationChatIds) ? fromFile.notificationChatIds : [],
            allowedUsers: Array.isArray(fromFile.allowedUsers) ? fromFile.allowedUsers : [],
            language: fromFile.language === 'he' || fromFile.language === 'en' ? fromFile.language : 'en',
        };

        const idx = entries.findIndex(e => e.path === TELEGRAM_CONFIG_SNAPSHOT_PATH);
        if (idx >= 0) {
            entries.splice(idx, 1);
        }

        const json = JSON.stringify(merged, null, 2);
        entries.push({
            path: TELEGRAM_CONFIG_SNAPSHOT_PATH,
            encoding: 'base64',
            content: Buffer.from(json, 'utf8').toString('base64')
        });
    }

    private async buildSnapshot(scopes?: BackupScopeId[]): Promise<BackupSnapshot> {
        const files = await this.collectSnapshotFiles(scopes);
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

    async createLocalBackup(scopes?: BackupScopeId[]): Promise<{ filename: string; path: string }> {
        await fs.ensureDir(BACKUPS_DIR);
        const snapshot = await this.buildSnapshot(scopes);
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
     * Restore from a backup snapshot. Full restore (no scopes) replaces managed dirs and follows legacy DB rules.
     * Partial restore merges selected paths; restoring `database` replaces app.db only.
     */
    private async restoreFromSnapshot(snapshot: BackupSnapshot, scopes?: BackupScopeId[]): Promise<RestoreSnapshotResult> {
        if (!snapshot || !SUPPORTED_SNAPSHOT_VERSIONS.includes(snapshot.version) || !Array.isArray(snapshot.files)) {
            throw new Error('Invalid backup snapshot format');
        }

        const isPartial = scopes !== undefined && scopes.length > 0;
        const snapshotHadDb = snapshot.files.some(e => e.path === 'app.db');

        let filesToRestore = snapshot.files;
        if (isPartial) {
            filesToRestore = snapshot.files.filter(e => {
                const sc = backupEntryPathToScope(e.path);
                return sc !== null && scopes!.includes(sc);
            });
            if (filesToRestore.length === 0) {
                throw new Error('No files in this backup match the selected scopes');
            }
        }

        const willRestoreDb = filesToRestore.some(e => e.path === 'app.db');

        if (!isPartial) {
            for (const target of BACKUP_TARGETS) {
                await fs.ensureDir(path.join(DATA_DIR, target));
                await fs.emptyDir(path.join(DATA_DIR, target));
            }
            if (snapshotHadDb) {
                closeDbForRestore();
                for (const dbFile of ['app.db', 'app.db-shm', 'app.db-wal']) {
                    const dbPath = path.join(DATA_DIR, dbFile);
                    if (await fs.pathExists(dbPath)) {
                        await fs.remove(dbPath);
                    }
                }
            }
        } else if (willRestoreDb) {
            closeDbForRestore();
            for (const dbFile of ['app.db', 'app.db-shm', 'app.db-wal']) {
                const dbPath = path.join(DATA_DIR, dbFile);
                if (await fs.pathExists(dbPath)) {
                    await fs.remove(dbPath);
                }
            }
        }

        let wroteResultsFiles = false;
        for (const entry of filesToRestore) {
            const content = Buffer.from(entry.content, 'base64');

            if (entry.path === RUNTIME_SETTINGS_SNAPSHOT_PATH) {
                await fs.ensureDir(path.dirname(RUNTIME_SETTINGS_PATH));
                await fs.writeFile(RUNTIME_SETTINGS_PATH, content);
                continue;
            }

            const relativePath = this.resolveSafeRelativePath(entry.path);
            if (relativePath.startsWith('results/')) {
                wroteResultsFiles = true;
            }
            const outputPath = path.join(DATA_DIR, relativePath);
            const outputDir = path.dirname(outputPath);
            await fs.ensureDir(outputDir);
            await fs.writeFile(outputPath, content);
        }

        const dbRestored = willRestoreDb;
        const needsReloadFromFiles = !dbRestored && (isPartial ? wroteResultsFiles : true);

        return { dbRestored, needsReloadFromFiles };
    }

    async restoreFromLocalBackup(filename: string, scopes?: BackupScopeId[]): Promise<RestoreSnapshotResult> {
        const resolved = this.getLocalBackupPath(filename);
        if (!await fs.pathExists(resolved)) {
            throw new Error('Backup file not found');
        }

        const snapshot = await fs.readJson(resolved) as BackupSnapshot;
        return await this.restoreFromSnapshot(snapshot, scopes);
    }

    async restoreFromDriveBackup(fileId: string, scopes?: BackupScopeId[]): Promise<RestoreSnapshotResult> {
        const auth = await this.authService.getClient();
        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        const raw = Buffer.from(response.data as ArrayBuffer).toString('utf8');
        const snapshot = JSON.parse(raw) as BackupSnapshot;
        return await this.restoreFromSnapshot(snapshot, scopes);
    }

    async restoreFromUploadedBackup(filePath: string, scopes?: BackupScopeId[]): Promise<RestoreSnapshotResult> {
        const snapshot = await fs.readJson(filePath) as BackupSnapshot;
        return await this.restoreFromSnapshot(snapshot, scopes);
    }

    private summarizeSnapshot(snapshot: BackupSnapshot): BackupSnapshotSummary {
        if (!snapshot || !SUPPORTED_SNAPSHOT_VERSIONS.includes(snapshot.version) || !Array.isArray(snapshot.files)) {
            throw new Error('Invalid backup snapshot format');
        }
        return {
            version: snapshot.version,
            createdAt: snapshot.createdAt,
            scopes: backupScopesInSnapshot(snapshot),
            fileCount: snapshot.files.length
        };
    }

    async summarizeLocalBackupFile(filename: string): Promise<BackupSnapshotSummary> {
        const resolved = this.getLocalBackupPath(filename);
        if (!(await fs.pathExists(resolved))) {
            throw new Error('Backup file not found');
        }
        const snapshot = await fs.readJson(resolved) as BackupSnapshot;
        return this.summarizeSnapshot(snapshot);
    }

    async summarizeDriveBackupFile(fileId: string): Promise<BackupSnapshotSummary> {
        const auth = await this.authService.getClient();
        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );
        const raw = Buffer.from(response.data as ArrayBuffer).toString('utf8');
        const snapshot = JSON.parse(raw) as BackupSnapshot;
        return this.summarizeSnapshot(snapshot);
    }
}
