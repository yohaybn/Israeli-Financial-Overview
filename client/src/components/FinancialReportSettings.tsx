import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    DEFAULT_FINANCIAL_REPORT_SCHEDULE,
    DEFAULT_FINANCIAL_REPORT_SECTIONS,
    type FinancialReportLocaleMode,
    type FinancialReportSections,
} from '@app/shared';
import { ScheduleEditor, type ScheduleEditorValue } from './ScheduleEditor';
import { useFinancialReportSettings, useUpdateFinancialReportSettings } from '../hooks/useScraper';
import { getApiRoot } from '../lib/api';

function todayLocalISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const emptyFrSchedule = (): ScheduleEditorValue => ({
    scheduleType: 'weekly',
    runTime: '07:00',
    weekdays: [1],
    monthDays: [1],
    intervalDays: 3,
    intervalAnchorDate: todayLocalISO(),
    customCron: '0 7 * * 1',
});

export function FinancialReportSettings() {
    const { t } = useTranslation();
    const { data, isLoading, refetch } = useFinancialReportSettings();
    const { mutateAsync: save, isPending } = useUpdateFinancialReportSettings();

    const [enabled, setEnabled] = useState(false);
    const [sendTelegram, setSendTelegram] = useState(false);
    const [localeMode, setLocaleMode] = useState<FinancialReportLocaleMode>('bilingual');
    const [scheduledMonthRule, setScheduledMonthRule] = useState<'previous_calendar_month' | 'current_calendar_month'>(
        'previous_calendar_month'
    );
    const [sections, setSections] = useState<FinancialReportSections>({ ...DEFAULT_FINANCIAL_REPORT_SECTIONS });
    const [editor, setEditor] = useState<ScheduleEditorValue>(emptyFrSchedule);
    const [message, setMessage] = useState<string | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);

    useEffect(() => {
        if (!data) return;
        const fr = data as Record<string, unknown>;
        setEnabled(Boolean(fr.enabled));
        setSendTelegram(Boolean(fr.sendTelegram));
        const lm = fr.localeMode;
        setLocaleMode(lm === 'he' || lm === 'en' || lm === 'bilingual' ? lm : 'bilingual');
        setScheduledMonthRule(
            fr.scheduledMonthRule === 'current_calendar_month' ? 'current_calendar_month' : 'previous_calendar_month'
        );
        setSections({
            ...DEFAULT_FINANCIAL_REPORT_SECTIONS,
            ...(typeof fr.sections === 'object' && fr.sections ? (fr.sections as FinancialReportSections) : {}),
        });
        const parts = String(fr.cronExpression ?? '').split(' ') || [];
        const runTime =
            typeof fr.runTime === 'string' && fr.runTime
                ? fr.runTime
                : parts.length >= 2
                  ? `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`
                  : '07:00';
        setEditor({
            scheduleType: (fr.scheduleType as ScheduleEditorValue['scheduleType']) ?? 'weekly',
            runTime,
            weekdays: Array.isArray(fr.weekdays) && fr.weekdays.length ? [...(fr.weekdays as number[])].sort((a, b) => a - b) : [1],
            monthDays: Array.isArray(fr.monthDays) && fr.monthDays.length ? [...(fr.monthDays as number[])].sort((a, b) => a - b) : [1],
            intervalDays: typeof fr.intervalDays === 'number' ? fr.intervalDays : 3,
            intervalAnchorDate: typeof fr.intervalAnchorDate === 'string' ? fr.intervalAnchorDate : todayLocalISO(),
            customCron: typeof fr.cronExpression === 'string' ? fr.cronExpression : '0 7 * * 1',
        });
    }, [data]);

    const patchEditor = useCallback((patch: Partial<ScheduleEditorValue>) => {
        setEditor((prev) => ({ ...prev, ...patch }));
    }, []);

    const buildPayload = useCallback(() => {
        const sw = editor.weekdays.length ? editor.weekdays : [1];
        const sm = editor.monthDays.length ? editor.monthDays : [1];
        return {
            enabled,
            sendTelegram,
            localeMode,
            scheduledMonthRule,
            sections,
            scheduleType: editor.scheduleType,
            runTime: editor.runTime,
            weekdays: sw,
            monthDays: sm,
            intervalDays: editor.intervalDays,
            intervalAnchorDate: editor.intervalAnchorDate,
            cronExpression: editor.scheduleType === 'custom' ? editor.customCron : undefined,
        };
    }, [enabled, sendTelegram, localeMode, scheduledMonthRule, sections, editor]);

    const onSave = async () => {
        setMessage(null);
        try {
            await save(buildPayload());
            setMessage(t('report.save_ok'));
            void refetch();
        } catch {
            setMessage(t('report.save_failed'));
        }
    };

    const onResetDefaults = () => {
        const d = DEFAULT_FINANCIAL_REPORT_SCHEDULE;
        setEnabled(d.enabled);
        setSendTelegram(d.sendTelegram);
        setLocaleMode(d.localeMode);
        setScheduledMonthRule(d.scheduledMonthRule);
        setSections({ ...d.sections });
        const parts = d.cronExpression.split(' ');
        const runTime = d.runTime ?? `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`;
        setEditor({
            scheduleType: d.scheduleType ?? 'weekly',
            runTime,
            weekdays: d.weekdays?.length ? [...d.weekdays] : [1],
            monthDays: d.monthDays?.length ? [...d.monthDays] : [1],
            intervalDays: d.intervalDays ?? 3,
            intervalAnchorDate: d.intervalAnchorDate ?? todayLocalISO(),
            customCron: d.cronExpression,
        });
    };

    const previewMonth = () => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    };

    const onPreviewPdf = async () => {
        setPreviewBusy(true);
        setMessage(null);
        try {
            const res = await fetch(`${getApiRoot()}/reports/financial-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month: previewMonth(),
                    localeMode,
                    sections,
                }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error((j as { error?: string }).error || res.statusText);
            }
            const blob = await res.blob();
            const disp = res.headers.get('Content-Disposition');
            let filename = `financial-report-${previewMonth()}.pdf`;
            const m = disp && /filename="([^"]+)"/.exec(disp);
            if (m) filename = m[1];
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
            setMessage(t('report.preview_ok'));
        } catch {
            setMessage(t('report.preview_failed'));
        } finally {
            setPreviewBusy(false);
        }
    };

    const toggleSection = (key: keyof FinancialReportSections) => {
        setSections((s) => ({ ...s, [key]: !s[key] }));
    };

    if (isLoading && !data) {
        return <p className="text-gray-500 text-sm">{t('common.loading')}</p>;
    }

    const lastRun = data && typeof (data as { lastRun?: string }).lastRun === 'string' ? (data as { lastRun: string }).lastRun : null;

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-xl font-bold text-gray-900">{t('config_tabs.financial-report')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('report.subtitle')}</p>
            </div>

            {lastRun && (
                <p className="text-xs text-gray-500">
                    {t('report.last_run')}: {new Date(lastRun).toLocaleString()}
                </p>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={() => setEnabled(!enabled)} className="rounded border-gray-300" />
                    <span className="text-sm font-medium text-gray-800">{t('report.enable_schedule')}</span>
                </label>
                <ScheduleEditor value={editor} onChange={patchEditor} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('report.month_rule')}</p>
                <select
                    value={scheduledMonthRule}
                    onChange={(e) =>
                        setScheduledMonthRule(
                            e.target.value === 'current_calendar_month' ? 'current_calendar_month' : 'previous_calendar_month'
                        )
                    }
                    className="w-full max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                    <option value="previous_calendar_month">{t('report.month_previous')}</option>
                    <option value="current_calendar_month">{t('report.month_current')}</option>
                </select>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('report.locale')}</p>
                <div className="flex flex-wrap gap-4">
                    {(['he', 'en', 'bilingual'] as const).map((lm) => (
                        <label key={lm} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="fr-locale" checked={localeMode === lm} onChange={() => setLocaleMode(lm)} />
                            {t(`report.locale_${lm}`)}
                        </label>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('report.sections_title')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {(
                        [
                            ['kpis', 'report.sec_kpis'],
                            ['categoryBreakdown', 'report.sec_categories'],
                            ['topMerchants', 'report.sec_merchants'],
                            ['executiveSummary', 'report.sec_summary'],
                            ['insights', 'report.sec_insights'],
                            ['metaSpend', 'report.sec_meta'],
                        ] as const
                    ).map(([key, labelKey]) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} />
                            {t(labelKey)}
                        </label>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={sendTelegram} onChange={() => setSendTelegram(!sendTelegram)} className="rounded border-gray-300" />
                    <span className="text-sm font-medium text-gray-800">{t('report.send_telegram')}</span>
                </label>
                <p className="text-xs text-gray-500">{t('report.send_telegram_help')}</p>
            </div>

            {message && <p className="text-sm text-emerald-700">{message}</p>}

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => void onSave()}
                    disabled={isPending}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                    {t('report.save')}
                </button>
                <button type="button" onClick={onResetDefaults} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
                    {t('report.reset_defaults')}
                </button>
                <button
                    type="button"
                    onClick={() => void onPreviewPdf()}
                    disabled={previewBusy}
                    className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                >
                    {previewBusy ? '…' : t('report.preview_pdf')}
                </button>
            </div>
        </div>
    );
}
