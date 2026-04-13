/** Logical slices of a backup snapshot; same order as server UI. */
export const BACKUP_SCOPE_IDS = [
    'database',
    'results',
    'config',
    'profiles',
    'import_profiles',
    'security',
    'post_scrape',
    'runtime_settings',
    'root_config'
] as const;

export type BackupScopeId = (typeof BACKUP_SCOPE_IDS)[number];

/** Path used inside JSON snapshots for runtime-settings (maps to config/runtime-settings.json on disk). */
export const BACKUP_SNAPSHOT_RUNTIME_SETTINGS_PATH = 'root/runtime-settings.json';

export function isBackupScopeId(s: string): s is BackupScopeId {
    return (BACKUP_SCOPE_IDS as readonly string[]).includes(s);
}

/** Map a snapshot entry path to its scope, or null if unknown (ignored during restore). */
export function backupEntryPathToScope(entryPath: string): BackupScopeId | null {
    if (entryPath === 'app.db') {
        return 'database';
    }
    if (entryPath === BACKUP_SNAPSHOT_RUNTIME_SETTINGS_PATH) {
        return 'runtime_settings';
    }
    if (entryPath === 'scheduler_config.json' || entryPath === 'notification_config.json') {
        return 'root_config';
    }
    const top = entryPath.split('/')[0];
    if (
        top === 'results' ||
        top === 'config' ||
        top === 'profiles' ||
        top === 'import_profiles' ||
        top === 'security' ||
        top === 'post_scrape'
    ) {
        return top as BackupScopeId;
    }
    return null;
}

/** Unique scopes present in a snapshot, in canonical order. */
export function backupScopesInSnapshot(snapshot: { files?: { path: string }[] }): BackupScopeId[] {
    const set = new Set<BackupScopeId>();
    for (const e of snapshot.files ?? []) {
        if (!e?.path) continue;
        const sc = backupEntryPathToScope(e.path);
        if (sc) set.add(sc);
    }
    return BACKUP_SCOPE_IDS.filter((id) => set.has(id));
}
