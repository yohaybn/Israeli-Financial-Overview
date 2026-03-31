import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleCard } from './CollapsibleCard';
import { isDemoMode } from '../demo/isDemo';
import { getAppBuildVersion } from '../utils/feedbackForm';
import { compareSemverCore, fetchLatestGitHubRelease, parseSemverCore } from '../utils/githubRelease';

type CheckState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'no_release'; latestUrl: string }
    | { status: 'up_to_date'; latestTag: string; latestUrl: string }
    | { status: 'update_available'; currentLabel: string; latestTag: string; latestUrl: string }
    | { status: 'unparsed_local'; latestTag: string; latestUrl: string };

function releasesPageUrl(repo: string): string {
    const r = repo.trim();
    return `https://github.com/${r}/releases`;
}

export function GitHubUpdateCheck() {
    const { t } = useTranslation();
    const repo = import.meta.env.VITE_GITHUB_REPO?.trim() ?? '';
    const [state, setState] = useState<CheckState>({ status: 'idle' });

    const runCheck = useCallback(async () => {
        if (!repo) return;
        setState({ status: 'loading' });
        try {
            const latest = await fetchLatestGitHubRelease(repo);
            if (!latest) {
                setState({ status: 'no_release', latestUrl: releasesPageUrl(repo) });
                return;
            }
            const localRaw = getAppBuildVersion();
            const localCore = parseSemverCore(localRaw);
            const remoteCore = parseSemverCore(latest.tagName);
            if (!localCore || !remoteCore) {
                setState({
                    status: 'unparsed_local',
                    latestTag: latest.tagName,
                    latestUrl: latest.htmlUrl
                });
                return;
            }
            const cmp = compareSemverCore(localCore, remoteCore);
            if (cmp < 0) {
                setState({
                    status: 'update_available',
                    currentLabel: localRaw,
                    latestTag: latest.tagName,
                    latestUrl: latest.htmlUrl
                });
            } else {
                setState({ status: 'up_to_date', latestTag: latest.tagName, latestUrl: latest.htmlUrl });
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setState({ status: 'error', message });
        }
    }, [repo]);

    useEffect(() => {
        if (isDemoMode() || !repo) return undefined;
        void runCheck();
        return undefined;
    }, [repo, runCheck]);

    if (isDemoMode() || !repo) {
        return null;
    }

    return (
        <CollapsibleCard
            title={t('maintenance.github_release_title')}
            subtitle={t('maintenance.github_release_subtitle')}
            defaultOpen
            bodyClassName="px-6 pb-6 pt-0 space-y-3"
        >
            <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{t('maintenance.github_release_current')}:</span>{' '}
                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{getAppBuildVersion()}</code>
            </p>

            {state.status === 'loading' || state.status === 'idle' ? (
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
            ) : null}

            {state.status === 'error' ? (
                <div className="space-y-2">
                    <p className="text-sm text-red-700">{t('maintenance.github_release_error', { error: state.message })}</p>
                    <button
                        type="button"
                        onClick={() => void runCheck()}
                        className="px-4 py-2 bg-white text-amber-800 border border-amber-300 rounded-lg text-sm font-semibold hover:bg-amber-50"
                    >
                        {t('common.retry')}
                    </button>
                </div>
            ) : null}

            {state.status === 'no_release' ? (
                <p className="text-sm text-slate-600">
                    {t('maintenance.github_release_none')}{' '}
                    <a
                        href={state.latestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-700 underline font-medium"
                    >
                        {t('maintenance.github_release_releases_link')}
                    </a>
                </p>
            ) : null}

            {state.status === 'up_to_date' ? (
                <p className="text-sm text-emerald-800">
                    {t('maintenance.github_release_up_to_date', { tag: state.latestTag })}{' '}
                    <a
                        href={state.latestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-900 underline font-medium"
                    >
                        {t('maintenance.github_release_view')}
                    </a>
                </p>
            ) : null}

            {state.status === 'update_available' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <p className="text-sm text-amber-950 font-semibold">
                        {t('maintenance.github_release_new_available', { tag: state.latestTag })}
                    </p>
                    <p className="text-xs text-amber-900/90">{t('maintenance.github_release_you_have', { version: state.currentLabel })}</p>
                    <a
                        href={state.latestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700"
                    >
                        {t('maintenance.github_release_open')}
                    </a>
                </div>
            ) : null}

            {state.status === 'unparsed_local' ? (
                <div className="space-y-2">
                    <p className="text-sm text-slate-700">{t('maintenance.github_release_unparsed')}</p>
                    <p className="text-xs text-slate-600">
                        {t('maintenance.github_release_latest_is', { tag: state.latestTag })}{' '}
                        <a
                            href={state.latestUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-700 underline font-medium"
                        >
                            {t('maintenance.github_release_view')}
                        </a>
                    </p>
                </div>
            ) : null}

            {state.status !== 'idle' && state.status !== 'loading' && state.status !== 'error' ? (
                <>
                    <button
                        type="button"
                        onClick={() => void runCheck()}
                        className="text-sm text-slate-600 underline hover:text-slate-900"
                    >
                        {t('maintenance.github_release_check_again')}
                    </button>
                    <p className="text-xs text-slate-500">{t('maintenance.github_release_hint')}</p>
                </>
            ) : null}
        </CollapsibleCard>
    );
}
