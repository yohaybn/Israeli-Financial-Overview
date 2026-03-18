import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useCreateBackup,
    useDriveBackups,
    useDownloadLocalBackup,
    useLocalBackups,
    useReloadDatabase,
    useResetToDefaults,
    useRestoreDriveBackup,
    useRestoreLocalBackup,
    useRestoreUploadedBackup
} from '../hooks/useScraper';

export function MaintenancePanel() {
    const { t } = useTranslation();
    const { mutate: reloadDb, isPending } = useReloadDatabase();
    const { mutate: resetAll, isPending: isResetting } = useResetToDefaults();
    const { data: localBackups = [], refetch: refetchLocalBackups } = useLocalBackups();
    const { data: driveBackups = [], refetch: refetchDriveBackups } = useDriveBackups(true);
    const { mutate: createBackup, isPending: isCreatingBackup } = useCreateBackup();
    const { mutate: downloadLocalBackup, isPending: isDownloadingLocal } = useDownloadLocalBackup();
    const { mutate: restoreLocalBackup, isPending: isRestoringLocal } = useRestoreLocalBackup();
    const { mutate: restoreDriveBackup, isPending: isRestoringDrive } = useRestoreDriveBackup();
    const { mutate: restoreUploadedBackup, isPending: isRestoringUpload } = useRestoreUploadedBackup();

    const [selectedLocalBackup, setSelectedLocalBackup] = useState('');
    const [selectedDriveBackupId, setSelectedDriveBackupId] = useState('');

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
        const confirmMsg = t('table.confirm_reset_all');
        if (window.confirm(confirmMsg)) {
            resetAll(undefined, {
                onSuccess: () => {
                    alert(t('maintenance.reset_success'));
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                    alert(t('maintenance.reset_failed', { error: errorMsg }));
                }
            });
        }
    };

    const handleCreateBackup = (destination: 'local' | 'google-drive') => {
        createBackup(destination, {
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
        });
    };

    const handleRestoreLocalBackup = () => {
        if (!selectedLocalBackup) {
            alert(t('maintenance.backup_select_local_first'));
            return;
        }
        if (!window.confirm(t('maintenance.backup_confirm_restore_local'))) {
            return;
        }

        restoreLocalBackup(selectedLocalBackup, {
            onSuccess: () => {
                alert(t('maintenance.backup_restore_local_success'));
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                alert(t('maintenance.backup_restore_failed', { error: errorMsg }));
            }
        });
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
        if (!window.confirm(t('maintenance.backup_confirm_restore_drive'))) {
            return;
        }

        restoreDriveBackup(selectedDriveBackupId, {
            onSuccess: () => {
                alert(t('maintenance.backup_restore_drive_success'));
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                alert(t('maintenance.backup_restore_failed', { error: errorMsg }));
            }
        });
    };

    const handleUploadedBackupRestore = (file?: File | null) => {
        if (!file) return;
        if (!window.confirm(t('maintenance.backup_confirm_restore_upload'))) {
            return;
        }

        restoreUploadedBackup(file, {
            onSuccess: () => {
                alert(t('maintenance.backup_restore_upload_success'));
                refetchLocalBackups();
                refetchDriveBackups();
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                alert(t('maintenance.backup_restore_failed', { error: errorMsg }));
            }
        });
    };

    return (
        <div className="space-y-6">
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-2">{t('common.maintenance')}</h3>
                <p className="text-gray-500 text-sm mb-6">{t('common.maintenance_desc')}</p>

                <div className="space-y-4">
                    <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                        <h4 className="font-bold text-blue-900 mb-1">{t('maintenance.backup_title')}</h4>
                        <p className="text-blue-800 text-xs mb-4">{t('maintenance.backup_desc')}</p>
                        <div className="flex flex-wrap gap-3 mb-4">
                            <button
                                type="button"
                                onClick={() => handleCreateBackup('local')}
                                disabled={isCreatingBackup}
                                className="px-5 py-2.5 bg-white text-blue-700 border border-blue-300 rounded-2xl text-sm font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                            >
                                {isCreatingBackup ? t('common.loading') : t('maintenance.backup_create_local_button')}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateBackup('google-drive')}
                                disabled={isCreatingBackup}
                                className="px-5 py-2.5 bg-white text-blue-700 border border-blue-300 rounded-2xl text-sm font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                            >
                                {isCreatingBackup ? t('common.loading') : t('maintenance.backup_create_drive_button')}
                            </button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-white rounded-xl border border-blue-100 p-4">
                                <p className="text-sm font-bold text-blue-900 mb-2">{t('maintenance.backup_restore_local_title')}</p>
                                <select
                                    value={selectedLocalBackup}
                                    onChange={(e) => setSelectedLocalBackup(e.target.value)}
                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm mb-3"
                                >
                                    <option value="">{t('maintenance.backup_select_local_placeholder')}</option>
                                    {localBackups.map((b) => (
                                        <option key={b.filename} value={b.filename}>
                                            {b.filename}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleRestoreLocalBackup}
                                        disabled={isRestoringLocal}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {isRestoringLocal ? t('common.loading') : t('maintenance.backup_restore_local_button')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDownloadLocalBackup}
                                        disabled={isDownloadingLocal}
                                        className="px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-lg text-sm font-bold hover:bg-blue-50 disabled:opacity-50"
                                    >
                                        {isDownloadingLocal ? t('common.loading') : t('maintenance.backup_download_button')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-blue-100 p-4">
                                <p className="text-sm font-bold text-blue-900 mb-2">{t('maintenance.backup_restore_drive_title')}</p>
                                <select
                                    value={selectedDriveBackupId}
                                    onChange={(e) => setSelectedDriveBackupId(e.target.value)}
                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm mb-3"
                                >
                                    <option value="">{t('maintenance.backup_select_drive_placeholder')}</option>
                                    {driveBackups.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={handleRestoreDriveBackup}
                                    disabled={isRestoringDrive}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {isRestoringDrive ? t('common.loading') : t('maintenance.backup_restore_drive_button')}
                                </button>
                            </div>
                        </div>

                        <div className="mt-4">
                            <p className="text-sm font-bold text-blue-900 mb-2">{t('maintenance.backup_restore_upload_title')}</p>
                            <input
                                type="file"
                                accept=".json"
                                onChange={(e) => handleUploadedBackupRestore(e.target.files?.[0])}
                                disabled={isRestoringUpload}
                                className="block w-full text-sm text-blue-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                            />
                        </div>
                    </div>

                    <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100">
                        <h4 className="font-bold text-amber-900 mb-1">{t('maintenance.reload_title')}</h4>
                        <p className="text-amber-800 text-xs mb-4">{t('maintenance.reload_desc')}</p>
                        <button
                            type="button"
                            onClick={handleReload}
                            disabled={isPending}
                            className="px-6 py-2.5 bg-white text-amber-700 border border-amber-300 rounded-2xl text-sm font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
                        >
                            {isPending ? t('common.loading') : t('maintenance.reload_button')}
                        </button>
                    </div>

                    <div className="p-5 bg-red-50 rounded-2xl border border-red-100">
                        <h4 className="font-bold text-red-900 mb-1">{t('table.reset_all')}</h4>
                        <p className="text-red-800 text-xs mb-4">{t('table.reset_all_desc')}</p>
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={isResetting}
                            className="px-6 py-2.5 bg-white text-red-700 border border-red-300 rounded-2xl text-sm font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                        >
                            {isResetting ? t('common.loading') : t('common.reset_to_defaults')}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
