import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    DEFAULT_FINANCIAL_REPORT_SCHEDULE,
    DEFAULT_FINANCIAL_REPORT_SECTIONS,
    type FinancialReportLocaleMode,
    type FinancialReportSections,
} from '@app/shared';
import { ScheduleEditor, type ScheduleEditorValue } from './ScheduleEditor';
import { useFinancialReportSettings, useUpdateFinancialReportSettings } from '../hooks/useScraper';
import { useInvestmentAppSettings } from '../hooks/useInvestments';
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

function parseFinancialReportFromApi(fr: Record<string, unknown>): {
    enabled: boolean;
    sendTelegram: boolean;
    localeMode: FinancialReportLocaleMode;
    scheduledMonthRule: 'previous_calendar_month' | 'current_calendar_month';
    sections: FinancialReportSections;
    monthComparisonPriorMonths: number;
    monthComparisonYearOverYear: boolean;
    editor: ScheduleEditorValue;
} {
    const lm = fr.localeMode;
    const localeMode: FinancialReportLocaleMode =
        lm === 'he' || lm === 'en' || lm === 'bilingual' ? lm : 'bilingual';
    const parts = String(fr.cronExpression ?? '').split(' ') || [];
    const runTime =
        typeof fr.runTime === 'string' && fr.runTime
            ? fr.runTime
            : parts.length >= 2
              ? `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`
              : '07:00';
    const editor: ScheduleEditorValue = {
        scheduleType: (fr.scheduleType as ScheduleEditorValue['scheduleType']) ?? 'weekly',
        runTime,
        weekdays: Array.isArray(fr.weekdays) && fr.weekdays.length ? [...(fr.weekdays as number[])].sort((a, b) => a - b) : [1],
        monthDays: Array.isArray(fr.monthDays) && fr.monthDays.length ? [...(fr.monthDays as number[])].sort((a, b) => a - b) : [1],
        intervalDays: typeof fr.intervalDays === 'number' ? fr.intervalDays : 3,
        intervalAnchorDate: typeof fr.intervalAnchorDate === 'string' ? fr.intervalAnchorDate : todayLocalISO(),
        customCron: typeof fr.cronExpression === 'string' ? fr.cronExpression : '0 7 * * 1',
    };
    return {
        enabled: Boolean(fr.enabled),
        sendTelegram: Boolean(fr.sendTelegram),
        localeMode,
        scheduledMonthRule:
            fr.scheduledMonthRule === 'current_calendar_month' ? 'current_calendar_month' : 'previous_calendar_month',
        sections: {
            ...DEFAULT_FINANCIAL_REPORT_SECTIONS,
            ...(typeof fr.sections === 'object' && fr.sections ? (fr.sections as FinancialReportSections) : {}),
        },
        monthComparisonPriorMonths: (() => {
            const raw = fr.monthComparisonPriorMonths;
            if (typeof raw === 'number' && Number.isFinite(raw)) {
                return Math.max(0, Math.min(12, Math.floor(raw)));
            }
            return DEFAULT_FINANCIAL_REPORT_SCHEDULE.monthComparisonPriorMonths;
        })(),
        monthComparisonYearOverYear:
            typeof fr.monthComparisonYearOverYear === 'boolean'
                ? fr.monthComparisonYearOverYear
                : DEFAULT_FINANCIAL_REPORT_SCHEDULE.monthComparisonYearOverYear,
        editor,
    };
}

function buildFinancialReportPatch(p: {
    enabled: boolean;
    sendTelegram: boolean;
    localeMode: FinancialReportLocaleMode;
    scheduledMonthRule: 'previous_calendar_month' | 'current_calendar_month';
    sections: FinancialReportSections;
    monthComparisonPriorMonths: number;
    monthComparisonYearOverYear: boolean;
    editor: ScheduleEditorValue;
}): Record<string, unknown> {
    const sw = p.editor.weekdays.length ? p.editor.weekdays : [1];
    const sm = p.editor.monthDays.length ? p.editor.monthDays : [1];
    return {
        enabled: p.enabled,
        sendTelegram: p.sendTelegram,
        localeMode: p.localeMode,
        scheduledMonthRule: p.scheduledMonthRule,
        sections: p.sections,
        monthComparisonPriorMonths: p.monthComparisonPriorMonths,
        monthComparisonYearOverYear: p.monthComparisonYearOverYear,
        scheduleType: p.editor.scheduleType,
        runTime: p.editor.runTime,
        weekdays: sw,
        monthDays: sm,
        intervalDays: p.editor.intervalDays,
        intervalAnchorDate: p.editor.intervalAnchorDate,
        cronExpression: p.editor.scheduleType === 'custom' ? p.editor.customCron : undefined,
    };
}

export function FinancialReportSettings() {
    const { t } = useTranslation();
    const { data: investmentAppSettings } = useInvestmentAppSettings();
    const investmentsFeatureDisabled = investmentAppSettings?.featureEnabled === false;
    const { data, isLoading } = useFinancialReportSettings();
    const { mutateAsync: save, isPending } = useUpdateFinancialReportSettings();

    const lastSavedKeyRef = useRef<string | null>(null);

    const [enabled, setEnabled] = useState(false);
    const [sendTelegram, setSendTelegram] = useState(false);
    const [localeMode, setLocaleMode] = useState<FinancialReportLocaleMode>('bilingual');
    const [scheduledMonthRule, setScheduledMonthRule] = useState<'previous_calendar_month' | 'current_calendar_month'>(
        'previous_calendar_month'
    );
    const [sections, setSections] = useState<FinancialReportSections>({ ...DEFAULT_FINANCIAL_REPORT_SECTIONS });
    const [monthComparisonPriorMonths, setMonthComparisonPriorMonths] = useState(
        DEFAULT_FINANCIAL_REPORT_SCHEDULE.monthComparisonPriorMonths
    );
    const [monthComparisonYearOverYear, setMonthComparisonYearOverYear] = useState(
        DEFAULT_FINANCIAL_REPORT_SCHEDULE.monthComparisonYearOverYear
    );
    const [editor, setEditor] = useState<ScheduleEditorValue>(emptyFrSchedule);
    const [message, setMessage] = useState<string | null>(null);
    const [previewBusy, setPreviewBusy] = useState<'month' | 'all' | null>(null);
    const [syncedFromServer, setSyncedFromServer] = useState(false);

    useEffect(() => {
        if (!data) {
            setSyncedFromServer(false);
            lastSavedKeyRef.current = null;
            return;
        }
        const parsed = parseFinancialReportFromApi(data as Record<string, unknown>);
        setEnabled(parsed.enabled);
        setSendTelegram(parsed.sendTelegram);
        setLocaleMode(parsed.localeMode);
        setScheduledMonthRule(parsed.scheduledMonthRule);
        setSections(parsed.sections);
        setMonthComparisonPriorMonths(parsed.monthComparisonPriorMonths);
        setMonthComparisonYearOverYear(parsed.monthComparisonYearOverYear);
        setEditor(parsed.editor);
        lastSavedKeyRef.current = JSON.stringify(buildFinancialReportPatch(parsed));
        setSyncedFromServer(true);
    }, [data]);

    const patchEditor = useCallback((patch: Partial<ScheduleEditorValue>) => {
        setEditor((prev) => ({ ...prev, ...patch }));
    }, []);

    const buildPayload = useCallback(
        () =>
            buildFinancialReportPatch({
                enabled,
                sendTelegram,
                localeMode,
                scheduledMonthRule,
                sections,
                monthComparisonPriorMonths,
                monthComparisonYearOverYear,
                editor,
            }),
        [
            enabled,
            sendTelegram,
            localeMode,
            scheduledMonthRule,
            sections,
            monthComparisonPriorMonths,
            monthComparisonYearOverYear,
            editor,
        ]
    );

    useEffect(() => {
        if (!data || !syncedFromServer) return;
        const patch = buildPayload();
        const key = JSON.stringify(patch);
        if (lastSavedKeyRef.current === key) return;
        const timer = window.setTimeout(() => {
            const next = buildPayload();
            const nextKey = JSON.stringify(next);
            if (lastSavedKeyRef.current === nextKey) return;
            void (async () => {
                try {
                    await save(next);
                    lastSavedKeyRef.current = nextKey;
                    setMessage(t('report.save_ok'));
                } catch {
                    setMessage(t('report.save_failed'));
                }
            })();
        }, 500);
        return () => window.clearTimeout(timer);
    }, [data, syncedFromServer, buildPayload, save, t]);

    const onResetDefaults = () => {
        const d = DEFAULT_FINANCIAL_REPORT_SCHEDULE;
        setEnabled(d.enabled);
        setSendTelegram(d.sendTelegram);
        setLocaleMode(d.localeMode);
        setScheduledMonthRule(d.scheduledMonthRule);
        setSections({ ...d.sections });
        setMonthComparisonPriorMonths(d.monthComparisonPriorMonths);
        setMonthComparisonYearOverYear(d.monthComparisonYearOverYear);
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

    const onPreviewPdf = async (scope: 'month' | 'all') => {
        setPreviewBusy(scope);
        setMessage(null);
        try {
            const body =
                scope === 'all'
                    ? { scope: 'all' as const, localeMode, sections }
                    : {
                          month: previewMonth(),
                          localeMode,
                          sections,
                          monthComparisonPriorMonths,
                          monthComparisonYearOverYear,
                      };
            const res = await fetch(`${getApiRoot()}/reports/financial-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error((j as { error?: string }).error || res.statusText);
            }
            const blob = await res.blob();
            const disp = res.headers.get('Content-Disposition');
            let filename =
                scope === 'all' ? 'financial-report-all-time.pdf' : `financial-report-${previewMonth()}.pdf`;
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
            setPreviewBusy(null);
        }
    };

    const toggleSection = (key: keyof FinancialReportSections) => {
        setSections((s) => {
            const next = { ...s, [key]: !s[key] };
            if (key === 'monthComparison' && next.monthComparison === false) {
                next.monthComparisonAi = false;
            }
            return next;
        });
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
                <p className="text-gray-400 text-xs mt-1">{t('report.autosave_hint')}</p>
                {isPending && <p className="text-emerald-700 text-xs mt-1">{t('report.autosave_saving')}</p>}
            </div>

            {lastRun && (
                <p className="text-xs text-gray-500">
                    {t('report.last_run')}: {new Date(lastRun).toLocaleString()}
                </p>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('report.sections_title')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {(
                        [
                            ['kpis', 'report.sec_kpis'],
                            ['executiveSummary', 'report.sec_summary'],
                            ['insights', 'report.sec_insights'],
                            ['insightRulesTop', 'report.sec_insight_rules'],
                            ['metaSpend', 'report.sec_meta'],
                            ['investmentSummary', 'report.sec_investments'],
                            ['monthComparison', 'report.sec_month_compare'],
                        ] as const
                    ).map(([key, labelKey]) => (
                        <label
                            key={key}
                            className={`flex items-center gap-2 ${
                                key === 'investmentSummary' && investmentsFeatureDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={sections[key]}
                                disabled={key === 'investmentSummary' && investmentsFeatureDisabled}
                                onChange={() => toggleSection(key)}
                                className="rounded border-gray-300"
                            />
                            {t(labelKey)}
                        </label>
                    ))}
                </div>
                {investmentsFeatureDisabled && (
                    <p className="text-xs text-amber-800">{t('report.investments_pdf_disabled_hint')}</p>
                )}
                <p className="text-xs text-gray-500 pt-1">{t('report.sec_month_compare_help')}</p>
                {sections.monthComparison && (
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3 text-sm">
                        <label className="flex flex-col gap-1 max-w-xs">
                            <span className="text-gray-700">{t('report.month_compare_prior_label')}</span>
                            <input
                                type="number"
                                min={0}
                                max={12}
                                value={monthComparisonPriorMonths}
                                onChange={(e) => {
                                    const v = Math.max(0, Math.min(12, Math.floor(Number(e.target.value) || 0)));
                                    setMonthComparisonPriorMonths(v);
                                }}
                                className="rounded-lg border border-gray-200 px-3 py-2 w-24"
                            />
                            <span className="text-xs text-gray-500">{t('report.month_compare_prior_hint')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={monthComparisonYearOverYear}
                                onChange={() => setMonthComparisonYearOverYear(!monthComparisonYearOverYear)}
                                className="rounded border-gray-300"
                            />
                            <span>{t('report.month_compare_yoy')}</span>
                        </label>
                        <label className={`flex items-start gap-2 ${sections.monthComparison ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                            <input
                                type="checkbox"
                                checked={sections.monthComparisonAi}
                                disabled={!sections.monthComparison}
                                onChange={() => toggleSection('monthComparisonAi')}
                                className="rounded border-gray-300 mt-0.5"
                            />
                            <span>
                                <span className="block">{t('report.sec_month_compare_ai')}</span>
                                <span className="block text-xs text-gray-500 font-normal">{t('report.sec_month_compare_ai_help')}</span>
                            </span>
                        </label>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('report.detailed_charts_title')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {(
                        [
                            ['categoryBreakdown', 'report.sec_categories'],
                            ['topMerchants', 'report.sec_merchants'],
                            ['chartCategoryTreemap', 'report.sec_chart_treemap'],
                            ['chartMonthlyTrend', 'report.sec_chart_monthly'],
                            ['chartSpendingByWeekday', 'report.sec_chart_weekday'],
                            ['chartSpendingByMonthDay', 'report.sec_chart_monthday'],
                            ['chartMetaSpendPie', 'report.sec_chart_meta_pie'],
                            ['customCharts', 'report.sec_custom_charts'],
                        ] as const
                    ).map(([key, labelKey]) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} />
                            {t(labelKey)}
                        </label>
                    ))}
                </div>
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
                    onClick={onResetDefaults}
                    disabled={isPending}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                    {t('report.reset_defaults')}
                </button>
                <button
                    type="button"
                    onClick={() => void onPreviewPdf('month')}
                    disabled={previewBusy !== null}
                    className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                >
                    {previewBusy === 'month' ? '…' : t('report.preview_pdf')}
                </button>
                <button
                    type="button"
                    onClick={() => void onPreviewPdf('all')}
                    disabled={previewBusy !== null}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                    {previewBusy === 'all' ? '…' : t('report.preview_pdf_all_time')}
                </button>
            </div>
        </div>
    );
}
