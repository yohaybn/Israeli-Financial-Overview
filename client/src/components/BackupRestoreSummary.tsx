import { useTranslation } from 'react-i18next';
import type { BackupSnapshotSummaryDto } from '../hooks/useScraper';

type Props = {
    fileLabel: string;
    summary: BackupSnapshotSummaryDto;
};

export function BackupRestoreSummary({ fileLabel, summary }: Props) {
    const { t } = useTranslation();
    const dateStr = (() => {
        if (!summary.createdAt) return '';
        const d = new Date(summary.createdAt);
        return Number.isNaN(d.getTime())
            ? ''
            : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    })();

    return (
        <div className="rounded-xl border border-blue-200 bg-white p-3 text-sm shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-800">{t('maintenance.backup_summary_title')}</p>
            <p className="mt-1 text-xs text-blue-950 break-all">
                <span className="font-semibold">{t('maintenance.backup_summary_file')}</span> {fileLabel}
            </p>
            <p className="mt-1 text-xs text-gray-600">
                {t('maintenance.backup_summary_meta', {
                    count: summary.fileCount,
                    version: summary.version,
                    date: dateStr
                })}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
                {summary.scopes.map((id) => (
                    <li
                        key={id}
                        className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900"
                    >
                        {t(`maintenance.backup_scope_${id}`)}
                    </li>
                ))}
            </ul>
        </div>
    );
}
