import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import { google } from 'googleapis';
import { GoogleAuthService } from './googleAuthService.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const GOOGLE_FOLDER_CONFIG_PATH = path.join(CONFIG_DIR, 'google_folder.json');

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_NAME_PREFIX = 'bank-scraper-backup';
const BACKUP_EXT = '.backup.json';

const BACKUP_TARGETS = [
    'results',
    'config',
    'profiles',
    'post_scrape'
];

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

    private async collectSnapshotFiles(): Promise<BackupEntry[]> {
        const entries: BackupEntry[] = [];

        for (const target of BACKUP_TARGETS) {
            const targetPath = path.join(DATA_DIR, target);
            if (!await fs.pathExists(targetPath)) {
                continue;
            }

            const files = await fs.readdir(targetPath);
            for (const file of files) {
                const absolutePath = path.join(targetPath, file);
                const stat = await fs.stat(absolutePath);
                if (!stat.isFile()) {
                    continue;
                }

                const relativePath = this.resolveSafeRelativePath(path.posix.join(target, file));
                const buffer = await fs.readFile(absolutePath);
                entries.push({
                    path: relativePath,
                    encoding: 'base64',
                    content: buffer.toString('base64')
                });
            }
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

    private async restoreFromSnapshot(snapshot: BackupSnapshot): Promise<void> {
        if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || !Array.isArray(snapshot.files)) {
            throw new Error('Invalid backup snapshot format');
        }

        for (const target of BACKUP_TARGETS) {
            await fs.ensureDir(path.join(DATA_DIR, target));
            await fs.emptyDir(path.join(DATA_DIR, target));
        }

        for (const entry of snapshot.files) {
            const relativePath = this.resolveSafeRelativePath(entry.path);
            const outputPath = path.join(DATA_DIR, relativePath);
            const outputDir = path.dirname(outputPath);
            await fs.ensureDir(outputDir);

            const content = Buffer.from(entry.content, 'base64');
            await fs.writeFile(outputPath, content);
        }
    }

    async restoreFromLocalBackup(filename: string) {
        const resolved = this.getLocalBackupPath(filename);
        if (!await fs.pathExists(resolved)) {
            throw new Error('Backup file not found');
        }

        const snapshot = await fs.readJson(resolved) as BackupSnapshot;
        await this.restoreFromSnapshot(snapshot);
    }

    async restoreFromDriveBackup(fileId: string) {
        const auth = await this.authService.getClient();
        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        const raw = Buffer.from(response.data as ArrayBuffer).toString('utf8');
        const snapshot = JSON.parse(raw) as BackupSnapshot;
        await this.restoreFromSnapshot(snapshot);
    }

    async restoreFromUploadedBackup(filePath: string) {
        const snapshot = await fs.readJson(filePath) as BackupSnapshot;
        await this.restoreFromSnapshot(snapshot);
    }
}
