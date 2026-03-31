import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backupScopesInSnapshot } from '@app/shared';
import {
    useBackupScopes,
    useCreateBackup,
    useDriveBackupSummary,
    useDriveBackups,
    useDownloadLocalBackup,
    useLocalBackupSummary,
    useLocalBackups,
    useReloadDatabase,
    useResetToDefaults,
    useRestoreDriveBackup,
    useRestoreLocalBackup,
    useRestoreUploadedBackup,
    type BackupSnapshotSummaryDto
} from '../hooks/useScraper';
import { CollapsibleCard } from './CollapsibleCard';
import { MaintenanceServerPathsCard } from './MaintenanceServerPathsCard';
import { clearBrowserSiteData } from '../utils/clearBrowserSiteData';
import { BackupScopePicker } from './BackupScopePicker';
import { BackupRestoreSummary } from './BackupRestoreSummary';

const SNAPSHOT_VERSIONS = [1, 2, 3];

function scopesToApiPayload(selected: string[] | null, allIds: string[]): string[] | undefined {
    if (!selected || !allIds.length) {
        return undefined;
    }
    if (selected.length === allIds.length) {
        return undefined;
    }
    return selected;
}

export function MaintenancePanel() {
    const { t } = useTranslation();
    const { mutate: reloadDb, isPending } = useReloadDatabase();
    const { mutate: resetAll, isPending: isResetting } = useResetToDefaults();
    const { data: scopeIds = [] } = useBackupScopes();
    const { data: localBackups = [], refetch: refetchLocalBackups } = useLocalBackups();
    const { data: driveBackups = [], refetch: refetchDriveBackups } = useDriveBackups(true);
    const { mutate: createBackup, isPending: isCreatingBackup } = useCreateBackup();
    const { mutate: downloadLocalBackup, isPending: isDownloadingLocal } = useDownloadLocalBackup();
    const { mutate: restoreLocalBackup, isPending: isRestoringLocal } = useRestoreLocalBackup();
    const { mutate: restoreDriveBackup, isPending: isRestoringDrive } = useRestoreDriveBackup();
    const { mutate: restoreUploadedBackup, isPending: isRestoringUpload } = useRestoreUploadedBackup();

    const uploadInputRef = useRef<HTMLInputElement>(null);

    const [selectedLocalBackup, setSelectedLocalBackup] = useState('');
    const [selectedDriveBackupId, setSelectedDriveBackupId] = useState('');
    const [backupScopes, setBackupScopes] = useState<string[] | null>(null);
    const [restoreScopes, setRestoreScopes] = useState<string[] | null>(null);

    /** Which restore source is active for summary + scope universe */
    const [restoreFocus, setRestoreFocus] = useState<'local' | 'drive' | 'upload' | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadSnapshotSummary, setUploadSnapshotSummary] = useState<
        (BackupSnapshotSummaryDto & { fileName: string }) | null
    >(null);
    const [uploadParseError, setUploadParseError] = useState<string | null>(null);

    const localSummaryQuery = useLocalBackupSummary(
        restoreFocus === 'local' && selectedLocalBackup ? selectedLocalBackup : null
    );
    const driveSummaryQuery = useDriveBackupSummary(
        restoreFocus === 'drive' && selectedDriveBackupId ? selectedDriveBackupId : null
    );

    const restoreUniverse = useMemo(() => {
        if (restoreFocus === 'local' && localSummaryQuery.data) {
            return localSummaryQuery.data.scopes;
        }
        if (restoreFocus === 'drive' && driveSummaryQuery.data) {
            return driveSummaryQuery.data.scopes;
        }
        if (restoreFocus === 'upload' && uploadSnapshotSummary) {
            return uploadSnapshotSummary.scopes;
        }
        return [];
    }, [restoreFocus, localSummaryQuery.data, driveSummaryQuery.data, uploadSnapshotSummary]);

    useEffect(() => {
        if (scopeIds.length && backupScopes === null) {
            setBackupScopes([...scopeIds]);
        }
    }, [scopeIds, backupScopes]);

    useEffect(() => {
        if (restoreUniverse.length) {
            setRestoreScopes([...restoreUniverse]);
        }
    }, [restoreFocus, selectedLocalBackup, selectedDriveBackupId, uploadFile?.name, localSummaryQuery.data, driveSummaryQuery.data, uploadSnapshotSummary]);

    const handleLocalBackupChange = (value: string) => {
        setSelectedLocalBackup(value);
        setSelectedDriveBackupId('');
        setUploadFile(null);
        setUploadSnapshotSummary(null);
        setUploadParseError(null);
        if (uploadInputRef.current) {
            uploadInputRef.current.value = '';
        }
        setRestoreFocus(value ? 'local' : null);
    };

    const handleDriveBackupChange = (value: string) => {
        setSelectedDriveBackupId(value);
        setSelectedLocalBackup('');
        setUploadFile(null);
        setUploadSnapshotSummary(null);
        setUploadParseError(null);
        if (uploadInputRef.current) {
            uploadInputRef.current.value = '';
        }
        setRestoreFocus(value ? 'drive' : null);
    };

    const handleUploadFileChange = (file: File | null | undefined) => {
        setSelectedLocalBackup('');
        setSelectedDriveBackupId('');
        setUploadFile(file ?? null);
        setUploadSnapshotSummary(null);
        setUploadParseError(null);
        if (!file) {
            setRestoreFocus(null);
            return;
        }
        setRestoreFocus('upload');
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const snap = JSON.parse(reader.result as string) as {
                    version?: number;
                    createdAt?: string;
                    files?: { path: string }[];
                };
                if (
                    typeof snap.version !== 'number' ||
                    !SNAPSHOT_VERSIONS.includes(snap.version) ||
                    !Array.isArray(snap.files)
                ) {
                    throw new Error('invalid');
                }
                const scopes = backupScopesInSnapshot(snap);
                setUploadSnapshotSummary({
                    scopes,
                    version: snap.version,
                    createdAt: snap.createdAt ?? '',
                    fileCount: snap.files.length,
                    fileName: file.name
                });
            } catch {
                setUploadParseError(t('maintenance.backup_parse_error'));
            }
        };
        reader.readAsText(file);
    };

    const handleReload = () => {
        if (window.confirm(t('maintenance.confirm_reload'))) {
            reloadDb(undefined, {
                onSuccess: () => {
                    alert(t('maintenance.reload_success'));
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                    alert(t('maintenance.reload_failed', { error: errorMsg }));
                }
            });
        }
    };

    const handleReset = () => {
        if (!window.confirm(t('maintenance.confirm_reset_factory_step1'))) {
            return;
        }
        if (!window.confirm(t('maintenance.confirm_factory_reset'))) {
            return;
        }
        resetAll(undefined, {
            onSuccess: () => {
                clearBrowserSiteData();
                alert(t('maintenance.reset_factory_success'));
                setTimeout(() => window.location.reload(), 400);
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                alert(t('maintenance.reset_failed', { error: errorMsg }));
            }
        });
    };

    const handleCreateBackup = (destination: 'local' | 'google-drive') => {
        if (!backupScopes?.length) {
            alert(t('maintenance.backup_scope_none_error'));
            return;
        }
        createBackup(
            { destination, scopes: scopesToApiPayload(backupScopes, scopeIds) },
            {
                onSuccess: () => {
                    alert(
                        destination === 'local'
                            ? t('maintenance.backup_create_local_success')
                            : t('maintenance.backup_create_drive_success')
                    );
                    refetchLocalBackups();
                    refetchDriveBackups();
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                    alert(t('maintenance.backup_failed', { error: errorMsg }));
                }
            }
        );
    };

    const runRestoreConfirm = (kind: 'local' | 'drive' | 'upload') => {
        if (!restoreScopes?.length || !restoreUniverse.length) {
            alert(t('maintenance.backup_scope_none_error'));
            return false;
        }
        const fullRestore = restoreScopes.length === restoreUniverse.length;
        const confirmKey =
            kind === 'local'
                ? fullRestore
                    ? 'backup_confirm_restore_local'
                    : 'backup_confirm_restore_partial_local'
                : kind === 'drive'
                  ? fullRestore
                      ? 'backup_confirm_restore_drive'
                      : 'backup_confirm_restore_partial_drive'
                  : fullRestore
                    ? 'backup_confirm_restore_upload'
                    : 'backup_confirm_restore_partial_upload';
        return window.confirm(t(confirmKey));
    };

    const handleRestoreLocalBackup = () => {
        if (!selectedLocalBackup) {
            alert(t('maintenance.backup_select_local_first'));
            return;
        }
        if (restoreFocus !== 'local' || !localSummaryQuery.data) {
            alert(t('maintenance.backup_restore_need_summary'));
            return;
        }
        if (!runRestoreConfirm('local')) {
            return;
        }

        restoreLocalBackup(
            { filename: selectedLocalBackup, scopes: scopesToApiPayload(restoreScopes, restoreUniverse) },
            {
                onSuccess: (result) => {
                    if (result.dbRestored) {
                        alert(t('maintenance.backup_restore_local_success') + '\n\n' + t('maintenance.backup_restore_restart_notice'));
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        alert(t('maintenance.backup_restore_local_success'));
                    }
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                    alert(t('maintenance.backup_restore_failed', { error: errorMsg }));
                }
            }
        );
    };

    const handleDownloadLocalBackup = () => {
        if (!selectedLocalBackup) {
            alert(t('maintenance.backup_select_local_first'));
            return;
        }

        downloadLocalBackup(selectedLocalBackup, {
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                alert(t('maintenance.backup_download_failed', { error: errorMsg }));
            }
        });
    };

    const handleRestoreDriveBackup = () => {
        if (!selectedDriveBackupId) {
            alert(t('maintenance.backup_select_drive_first'));
            return;
        }
        if (restoreFocus !== 'drive' || !driveSummaryQuery.data) {
            alert(t('maintenance.backup_restore_need_summary'));
            return;
        }
        if (!runRestoreConfirm('drive')) {
            return;
        }

        restoreDriveBackup(
            { fileId: selectedDriveBackupId, scopes: scopesToApiPayload(restoreScopes, restoreUniverse) },
            {
                onSuccess: (result) => {
                    if (result.dbRestored) {
                        alert(t('maintenance.backup_restore_drive_success') + '\n\n' + t('maintenance.backup_restore_restart_notice'));
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        alert(t('maintenance.backup_restore_drive_success'));
                    }
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                    alert(t('maintenance.backup_restore_failed', { error: errorMsg }));
                }
            }
        );
    };

    const handleRestoreUploadedBackup = () => {
        if (!uploadFile || !uploadSnapshotSummary) {
            alert(t('maintenance.backup_select_upload_first'));
            return;
        }
        if (restoreFocus !== 'upload') {
            alert(t('maintenance.backup_restore_need_summary'));
            return;
        }
        if (!runRestoreConfirm('upload')) {
            return;
        }

        restoreUploadedBackup(
            { file: uploadFile, scopes: scopesToApiPayload(restoreScopes, restoreUniverse) },
            {
                onSuccess: (result) => {
                    if (result.dbRestored) {
                        alert(t('maintenance.backup_restore_upload_success') + '\n\n' + t('maintenance.backup_restore_restart_notice'));
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        alert(t('maintenance.backup_restore_upload_success'));
                    }
                    refetchLocalBackups();
                    refetchDriveBackups();
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                    alert(t('maintenance.backup_restore_failed', { error: errorMsg }));
                }
            }
        );
    };

    const summaryBlock = (() => {
        if (restoreFocus === 'local' && selectedLocalBackup) {
            if (localSummaryQuery.isLoading) {
                return (
                    <p className="text-xs text-blue-800">{t('maintenance.backup_summary_loading')}</p>
                );
            }
            if (localSummaryQuery.isError) {
                return (
                    <p className="text-xs text-red-700">
                        {(localSummaryQuery.error as Error)?.message || t('common.unknown_error')}
                    </p>
                );
            }
            if (localSummaryQuery.data) {
                return <BackupRestoreSummary fileLabel={selectedLocalBackup} summary={localSummaryQuery.data} />;
            }
        }
        if (restoreFocus === 'drive' && selectedDriveBackupId) {
            if (driveSummaryQuery.isLoading) {
                return (
                    <p className="text-xs text-blue-800">{t('maintenance.backup_summary_loading')}</p>
                );
            }
            if (driveSummaryQuery.isError) {
                return (
                    <p className="text-xs text-red-700">
                        {(driveSummaryQuery.error as Error)?.message || t('common.unknown_error')}
                    </p>
                );
            }
            if (driveSummaryQuery.data) {
                const name =
                    driveBackups.find((b) => b.id === selectedDriveBackupId)?.name ?? selectedDriveBackupId;
                return <BackupRestoreSummary fileLabel={name} summary={driveSummaryQuery.data} />;
            }
        }
        if (restoreFocus === 'upload' && uploadFile) {
            if (uploadParseError) {
                return <p className="text-xs text-red-700">{uploadParseError}</p>;
            }
            if (uploadSnapshotSummary) {
                return (
                    <BackupRestoreSummary
                        fileLabel={uploadSnapshotSummary.fileName}
                        summary={uploadSnapshotSummary}
                    />
                );
            }
            return <p className="text-xs text-blue-800">{t('maintenance.backup_summary_loading')}</p>;
        }
        return <p className="text-xs text-gray-600">{t('maintenance.backup_restore_pick_source')}</p>;
    })();

    const canRestore =
        restoreUniverse.length > 0 && (restoreScopes?.length ?? 0) > 0 && !uploadParseError;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{t('common.maintenance')}</h3>
                <p className="text-gray-500 text-sm mb-2">{t('common.maintenance_desc')}</p>
            </div>

            <MaintenanceServerPathsCard />

            <CollapsibleCard title={t('maintenance.backup_title')} subtitle={t('maintenance.backup_desc')} defaultOpen bodyClassName="px-6 pb-6 pt-0">
                <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
                    <BackupScopePicker
                        scopeIds={scopeIds}
                        selected={backupScopes}
                        onChange={setBackupScopes}
                        labelKey="maintenance.backup_scope_include_label"
                    />
                    <div className="flex flex-wrap gap-3 mb-4">
                        <button
                            type="button"
                            onClick={() => handleCreateBackup('local')}
                            disabled={isCreatingBackup || !backupScopes?.length}
                            className="px-5 py-2.5 bg-white text-blue-700 border border-blue-300 rounded-2xl text-sm font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                        >
                            {isCreatingBackup ? t('common.loading') : t('maintenance.backup_create_local_button')}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCreateBackup('google-drive')}
                            disabled={isCreatingBackup || !backupScopes?.length}
                            className="px-5 py-2.5 bg-white text-blue-700 border border-blue-300 rounded-2xl text-sm font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                        >
                            {isCreatingBackup ? t('common.loading') : t('maintenance.backup_create_drive_button')}
                        </button>
                    </div>

                    <p className="text-sm font-bold text-blue-900">{t('maintenance.backup_restore_section_title')}</p>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-blue-100 p-4">
                            <p className="text-sm font-bold text-blue-900 mb-2">{t('maintenance.backup_restore_local_title')}</p>
                            <select
                                value={selectedLocalBackup}
                                onChange={(e) => handleLocalBackupChange(e.target.value)}
                                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm mb-3"
                            >
                                <option value="">{t('maintenance.backup_select_local_placeholder')}</option>
                                {localBackups.map((b) => (
                                    <option key={b.filename} value={b.filename}>
                                        {b.filename}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={handleDownloadLocalBackup}
                                disabled={isDownloadingLocal || !selectedLocalBackup}
                                className="px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-lg text-sm font-bold hover:bg-blue-50 disabled:opacity-50"
                            >
                                {isDownloadingLocal ? t('common.loading') : t('maintenance.backup_download_button')}
                            </button>
                        </div>

                        <div className="bg-white rounded-xl border border-blue-100 p-4">
                            <p className="text-sm font-bold text-blue-900 mb-2">{t('maintenance.backup_restore_drive_title')}</p>
                            <select
                                value={selectedDriveBackupId}
                                onChange={(e) => handleDriveBackupChange(e.target.value)}
                                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="">{t('maintenance.backup_select_drive_placeholder')}</option>
                                {driveBackups.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-blue-100 p-4">
                        <p className="text-sm font-bold text-blue-900 mb-2">{t('maintenance.backup_restore_upload_title')}</p>
                        <input
                            ref={uploadInputRef}
                            type="file"
                            accept=".json,application/json"
                            onChange={(e) => handleUploadFileChange(e.target.files?.[0])}
                            className="block w-full text-sm text-blue-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                        />
                    </div>

                    <div className="space-y-2">{summaryBlock}</div>

                    {restoreUniverse.length > 0 ? (
                        <BackupScopePicker
                            scopeIds={restoreUniverse}
                            selected={restoreScopes}
                            onChange={setRestoreScopes}
                            labelKey="maintenance.backup_scope_restore_label"
                        />
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleRestoreLocalBackup}
                            disabled={
                                isRestoringLocal ||
                                !canRestore ||
                                restoreFocus !== 'local' ||
                                !selectedLocalBackup ||
                                !localSummaryQuery.data
                            }
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isRestoringLocal ? t('common.loading') : t('maintenance.backup_restore_local_button')}
                        </button>
                        <button
                            type="button"
                            onClick={handleRestoreDriveBackup}
                            disabled={
                                isRestoringDrive ||
                                !canRestore ||
                                restoreFocus !== 'drive' ||
                                !selectedDriveBackupId ||
                                !driveSummaryQuery.data
                            }
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isRestoringDrive ? t('common.loading') : t('maintenance.backup_restore_drive_button')}
                        </button>
                        <button
                            type="button"
                            onClick={handleRestoreUploadedBackup}
                            disabled={
                                isRestoringUpload ||
                                !canRestore ||
                                restoreFocus !== 'upload' ||
                                !uploadFile ||
                                !uploadSnapshotSummary
                            }
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isRestoringUpload ? t('common.loading') : t('maintenance.backup_restore_upload_button')}
                        </button>
                    </div>
                </div>
            </CollapsibleCard>

            <CollapsibleCard title={t('maintenance.reload_title')} subtitle={t('maintenance.reload_desc')} defaultOpen bodyClassName="px-6 pb-6 pt-0">
                <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100">
                    <button
                        type="button"
                        onClick={handleReload}
                        disabled={isPending}
                        className="px-6 py-2.5 bg-white text-amber-700 border border-amber-300 rounded-2xl text-sm font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
                    >
                        {isPending ? t('common.loading') : t('maintenance.reload_button')}
                    </button>
                </div>
            </CollapsibleCard>

            <CollapsibleCard title={t('table.reset_all')} subtitle={t('table.reset_all_desc')} defaultOpen bodyClassName="px-6 pb-6 pt-0">
                <div className="p-5 bg-red-50 rounded-2xl border border-red-100 space-y-4">
                    <p className="text-sm text-red-900 leading-relaxed whitespace-pre-line">{t('maintenance.reset_factory_backup_hint')}</p>
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={isResetting}
                        className="px-6 py-2.5 bg-white text-red-700 border border-red-300 rounded-2xl text-sm font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                    >
                        {isResetting ? t('common.loading') : t('common.reset_to_defaults')}
                    </button>
                </div>
            </CollapsibleCard>
        </div>
    );
}
