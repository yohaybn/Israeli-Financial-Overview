import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleCard } from './CollapsibleCard';

export function DesktopAppSettings() {
    const { t } = useTranslation();
    const api = typeof window !== 'undefined' ? window.electronDesktop : undefined;
    const [closeToTray, setCloseToTray] = useState(true);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!api) return undefined;
        void api.getCloseToTray().then((v) => {
            setCloseToTray(v);
            setReady(true);
        });
        const off = api.onCloseToTrayChanged((v) => setCloseToTray(v));
        return () => {
            off();
        };
    }, [api]);

    if (!api) {
        return null;
    }

    return (
        <CollapsibleCard
            title={t('maintenance.desktop_app_title')}
            subtitle={t('maintenance.desktop_app_subtitle')}
            defaultOpen
            bodyClassName="px-6 pb-6 pt-0 space-y-4"
        >
            {!ready ? (
                <div className="text-sm text-gray-500">{t('common.loading')}</div>
            ) : (
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={closeToTray}
                        onChange={(e) => {
                            const v = e.target.checked;
                            setCloseToTray(v);
                            void api.setCloseToTray(v);
                        }}
                        className="mt-1 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-700 leading-relaxed">{t('maintenance.desktop_app_close_to_tray')}</span>
                </label>
            )}
        </CollapsibleCard>
    );
}
