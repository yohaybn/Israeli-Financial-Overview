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

    return (
        <div className="space-y-6">
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-2">{t('common.maintenance')}</h3>
                <p className="text-gray-500 text-sm mb-6">{t('common.maintenance_desc')}</p>

                <div className="space-y-4">
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
