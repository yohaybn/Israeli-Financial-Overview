import { useTranslation } from 'react-i18next';
import { Clock, ChevronDown } from 'lucide-react';
import type { SchedulerScheduleType } from '@app/shared';

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
const MONTH_DAY_NUMBERS = Array.from({ length: 31 }, (_, i) => i + 1);

const ACCENT = '#006d3c';
const TRACK = '#f0f2f5';

export type ScheduleEditorValue = {
    scheduleType: SchedulerScheduleType;
    runTime: string;
    weekdays: number[];
    monthDays: number[];
    intervalDays: number;
    intervalAnchorDate: string;
    customCron: string;
};

type ScheduleEditorProps = {
    value: ScheduleEditorValue;
    onChange: (patch: Partial<ScheduleEditorValue>) => void;
};

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2';

const fieldClass =
    'w-full px-3 py-2.5 rounded-xl text-sm text-[#1a2b3c] border-0 bg-[#f0f2f5] shadow-none outline-none transition-shadow focus:ring-2 focus:ring-[#006d3c]/25';

export function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
    const { t } = useTranslation();
    const v = value;

    const toggleWeekday = (day: number) => {
        const next = v.weekdays.includes(day) ? v.weekdays.filter((x) => x !== day) : [...v.weekdays, day];
        onChange({ weekdays: [...new Set(next)].sort((a, b) => a - b) });
    };

    const toggleMonthDay = (day: number) => {
        const next = v.monthDays.includes(day) ? v.monthDays.filter((x) => x !== day) : [...v.monthDays, day];
        onChange({ monthDays: [...new Set(next)].sort((a, b) => a - b) });
    };

    const showTimePicker = v.scheduleType !== 'custom';

    const selectClass =
        'w-full px-3 py-2.5 rounded-xl text-sm text-[#1a2b3c] border-0 bg-[#f0f2f5] appearance-none pr-10 shadow-none outline-none transition-shadow focus:ring-2 focus:ring-[#006d3c]/25';

    const timeInputClass =
        'w-full px-3 py-2.5 rounded-xl text-sm text-[#1a2b3c] border-0 bg-[#f0f2f5] pr-10 shadow-none outline-none transition-shadow focus:ring-2 focus:ring-[#006d3c]/25 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer';

    return (
        <div className="space-y-6">
            <div className={`grid grid-cols-1 gap-6 ${showTimePicker ? 'md:grid-cols-2' : ''}`}>
                <div className={showTimePicker ? '' : 'md:col-span-2'}>
                    <label className={labelCls}>{t('scheduler.frequency')}</label>
                    <div className="relative">
                        <select
                            value={v.scheduleType}
                            onChange={(e) => onChange({ scheduleType: e.target.value as SchedulerScheduleType })}
                            className={selectClass}
                        >
                            <option value="daily">{t('scheduler.frequency_daily')}</option>
                            <option value="weekly">{t('scheduler.frequency_weekly')}</option>
                            <option value="monthly">{t('scheduler.frequency_monthly')}</option>
                            <option value="interval_days">{t('scheduler.frequency_interval')}</option>
                            <option value="custom">{t('scheduler.frequency_custom')}</option>
                        </select>
                        <ChevronDown
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                            aria-hidden
                        />
                    </div>
                </div>

                {showTimePicker && (
                    <div>
                        <label className={labelCls}>{t('scheduler.run_time')}</label>
                        <div className="relative">
                            <input
                                type="time"
                                value={v.runTime}
                                onChange={(e) => onChange({ runTime: e.target.value })}
                                className={timeInputClass}
                            />
                            <Clock
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                                style={{ color: ACCENT }}
                                aria-hidden
                            />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">{t('scheduler.run_time_desc')}</p>
                    </div>
                )}
            </div>

            {v.scheduleType === 'weekly' && (
                <div>
                    <label className={labelCls}>{t('scheduler.weekdays')}</label>
                    <div
                        className="rounded-full px-2 py-2 sm:px-3 flex flex-wrap justify-center gap-2 sm:gap-1.5 sm:justify-between"
                        style={{ backgroundColor: TRACK }}
                    >
                        {WEEKDAY_INDEXES.map((day) => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleWeekday(day)}
                                className={`min-w-[2.25rem] w-9 h-9 sm:w-10 sm:h-10 rounded-full text-xs font-bold flex items-center justify-center transition-all shrink-0 ${
                                    v.weekdays.includes(day)
                                        ? 'text-white shadow-sm'
                                        : 'bg-gray-300/70 text-gray-700 hover:bg-gray-300'
                                }`}
                                style={v.weekdays.includes(day) ? { backgroundColor: ACCENT } : undefined}
                            >
                                {t(`scheduler.weekday_${day}` as const)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {v.scheduleType === 'monthly' && (
                <div>
                    <label className={labelCls}>{t('scheduler.month_days')}</label>
                    <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto pr-1 p-2 rounded-2xl" style={{ backgroundColor: TRACK }}>
                        {MONTH_DAY_NUMBERS.map((day) => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleMonthDay(day)}
                                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    v.monthDays.includes(day) ? 'text-white shadow-sm' : 'bg-white/80 text-gray-700 hover:bg-white'
                                }`}
                                style={v.monthDays.includes(day) ? { backgroundColor: ACCENT } : undefined}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {v.scheduleType === 'interval_days' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className={labelCls}>{t('scheduler.interval_days')}</label>
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={v.intervalDays}
                            onChange={(e) => onChange({ intervalDays: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>{t('scheduler.interval_anchor')}</label>
                        <input
                            type="date"
                            value={v.intervalAnchorDate}
                            onChange={(e) => onChange({ intervalAnchorDate: e.target.value })}
                            className={fieldClass}
                        />
                        <p className="mt-2 text-xs text-gray-500">{t('scheduler.interval_anchor_desc')}</p>
                    </div>
                </div>
            )}

            {v.scheduleType === 'custom' && (
                <div>
                    <label className={labelCls}>{t('scheduler.custom_cron')}</label>
                    <input
                        type="text"
                        value={v.customCron}
                        onChange={(e) => onChange({ customCron: e.target.value })}
                        placeholder="0 8 * * *"
                        className={`${fieldClass} font-mono text-sm`}
                    />
                    <p className="mt-2 text-xs text-gray-500">{t('scheduler.custom_cron_desc')}</p>
                </div>
            )}
        </div>
    );
}
