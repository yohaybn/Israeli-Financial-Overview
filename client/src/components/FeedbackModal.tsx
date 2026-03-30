import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Copy, ExternalLink } from 'lucide-react';
import { isDemoMode } from '../demo/isDemo';
import {
    buildFeedbackPayload,
    fetchLogsForFeedback,
    getAppBuildVersion,
    getFeedbackFormBaseUrl,
} from '../utils/feedbackForm';
import { getInstallationKindLabel } from '../utils/installationKind';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
    const { t } = useTranslation();
    const [consentServer, setConsentServer] = useState(false);
    const [consentClient, setConsentClient] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copyText, setCopyText] = useState<string | null>(null);

    const reset = useCallback(() => {
        setConsentServer(false);
        setConsentClient(false);
        setError(null);
        setCopyText(null);
    }, []);

    const handleClose = () => {
        reset();
        onClose();
    };

    const openForm = useCallback(async () => {
        setError(null);
        setCopyText(null);

        const base = getFeedbackFormBaseUrl();
        if (!base) {
            setError(t('feedback.form_not_configured'));
            return;
        }

        const demo = isDemoMode();
        const wantLogs = !demo && (consentServer || consentClient);

        let rawLogs = '';
        if (wantLogs) {
            setLoading(true);
            try {
                const types: Array<'server' | 'error_log'> = [];
                if (consentServer) types.push('server');
                if (consentClient) types.push('error_log');
                rawLogs = await fetchLogsForFeedback(types);
            } catch (e) {
                console.error(e);
                setError(t('feedback.log_fetch_failed'));
            }
            setLoading(false);
        }

        const { url, fullLogText } = buildFeedbackPayload({
            includeServer: consentServer && !demo,
            includeClient: consentClient && !demo,
            rawLogs,
        });

        window.open(url, '_blank', 'noopener,noreferrer');

        if (wantLogs && fullLogText) {
            setCopyText(fullLogText);
        }
    }, [consentServer, consentClient, t]);

    if (!isOpen) return null;

    const demo = isDemoMode();
    const installLabel = getInstallationKindLabel();
    const versionLabel = getAppBuildVersion();

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) handleClose();
            }}
        >
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 id="feedback-modal-title" className="text-lg font-semibold text-gray-900">
                        {t('feedback.modal_title')}
                    </h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                        aria-label={t('common.close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-4 py-4 space-y-4 text-sm text-gray-700">
                    <p className="text-gray-600">{t('feedback.modal_intro')}</p>

                    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 space-y-1">
                        <div className="flex justify-between gap-2">
                            <span className="text-gray-500">{t('feedback.installation_label')}</span>
                            <span className="font-medium text-gray-800 text-end break-all">{installLabel}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-gray-500">{t('feedback.version_label')}</span>
                            <span className="font-medium text-gray-800 text-end break-all">{versionLabel}</span>
                        </div>
                    </div>

                    {demo ? (
                        <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            {t('feedback.demo_no_logs')}
                        </p>
                    ) : (
                        <>
                            <p className="font-medium text-gray-800">{t('feedback.logs_section_title')}</p>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-gray-300"
                                    checked={consentServer}
                                    onChange={(e) => setConsentServer(e.target.checked)}
                                />
                                <span>{t('feedback.consent_server')}</span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-gray-300"
                                    checked={consentClient}
                                    onChange={(e) => setConsentClient(e.target.checked)}
                                />
                                <span>{t('feedback.consent_client')}</span>
                            </label>
                        </>
                    )}

                    {error ? (
                        <p className="text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                    ) : null}

                    {copyText ? (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-600">{t('feedback.copy_hint')}</p>
                            <textarea
                                readOnly
                                className="w-full h-32 text-xs font-mono border border-gray-200 rounded-lg p-2 bg-gray-50"
                                value={copyText}
                            />
                            <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(copyText)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs"
                            >
                                <Copy className="w-4 h-4" />
                                {t('feedback.copy_logs')}
                            </button>
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-2">
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => void openForm()}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-60"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                            {loading ? t('feedback.opening') : t('feedback.open_form')}
                        </button>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
