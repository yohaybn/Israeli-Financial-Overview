import { useTranslation } from 'react-i18next';
import { useReloadDatabase, useResetToDefaults } from '../hooks/useScraper';

export function MaintenancePanel() {
    const { t } = useTranslation();
    const { mutate: reloadDb, isPending } = useReloadDatabase();
    const { mutate: resetAll, isPending: isResetting } = useResetToDefaults();

    const handleReload = () => {
        if (window.confirm(t('maintenance.confirm_reload'))) {
            reloadDb(undefined, {
                onSuccess: () => {
                    alert(t('maintenance.reload_success'));
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                    alert(`Reload failed: ${errorMsg}`);
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
                    const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                    alert(`Reset failed: ${errorMsg}`);
                }
            });
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-2">{t('common.maintenance')}</h3>
                <p className="text-gray-600 text-sm mb-6">
                    {t('common.maintenance_desc')}
                </p>

                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between mb-6">
                    <div>
                        <h4 className="font-bold text-amber-900 mb-1">{t('maintenance.reload_title', 'Reload Database')}</h4>
                        <p className="text-amber-800 text-xs opacity-80 max-w-lg">
                            {t('maintenance.reload_desc', 'Clear the database and reload all transactions from JSON files.')}
                        </p>
                    </div>

                    <button
                        onClick={handleReload}
                        disabled={isPending}
                        className="bg-white text-amber-600 border-2 border-amber-200 hover:border-amber-600 px-6 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isPending ? t('common.loading') : t('table.reset_columns', 'Reload DB')}
                    </button>
                </div>

                <div className="p-6 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-red-900 mb-1">{t('table.reset_all')}</h4>
                        <p className="text-red-800 text-xs opacity-80 max-w-lg">
                            {t('table.reset_all_desc')}
                        </p>
                    </div>

                    <button
                        onClick={handleReset}
                        disabled={isResetting}
                        className="bg-white text-red-600 border-2 border-red-200 hover:border-red-600 px-6 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isResetting ? t('common.loading') : t('common.reset_to_defaults')}
                    </button>
                </div>
            </div>
        </div>
    );
}
