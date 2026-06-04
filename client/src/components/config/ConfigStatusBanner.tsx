import { useTranslation } from 'react-i18next';

interface ConfigStatusBannerProps {
    state: 'idle' | 'saving' | 'saved' | 'error';
    message?: string | null;
}

export function ConfigStatusBanner({ state, message }: ConfigStatusBannerProps) {
    const { t } = useTranslation();
    if (state === 'idle') return null;
    if (state === 'saving') {
        return <div className="text-xs text-blue-600 font-medium">{t('common.saving')}</div>;
    }
    if (state === 'saved') {
        return <div className="text-xs text-emerald-600 font-medium">{message || t('common.save_success')}</div>;
    }
    return <div className="text-xs text-rose-600 font-medium">{message || t('common.save_failed')}</div>;
}
