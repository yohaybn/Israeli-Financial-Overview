import { useTranslation } from 'react-i18next';
import type { SchedulerScheduleType } from '@app/shared';

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
const MONTH_DAY_NUMBERS = Array.from({ length: 31 }, (_, i) => i + 1);

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

    return (
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.frequency')}</label>
                <select
                    value={v.scheduleType}
                    onChange={(e) => onChange({ scheduleType: e.target.value as SchedulerScheduleType })}
                    className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                >
                    <option value="daily">{t('scheduler.frequency_daily')}</option>
                    <option value="weekly">{t('scheduler.frequency_weekly')}</option>
                    <option value="monthly">{t('scheduler.frequency_monthly')}</option>
                    <option value="interval_days">{t('scheduler.frequency_interval')}</option>
                    <option value="custom">{t('scheduler.frequency_custom')}</option>
                </select>
            </div>

            {showTimePicker && (
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.run_time')}</label>
                    <input
                        type="time"
                        value={v.runTime}
                        onChange={(e) => onChange({ runTime: e.target.value })}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                    />
                    <p className="mt-2 text-xs text-gray-500">{t('scheduler.run_time_desc')}</p>
                </div>
            )}

            {v.scheduleType === 'weekly' && (
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.weekdays')}</label>
                    <div className="flex flex-wrap gap-2">
                        {WEEKDAY_INDEXES.map((day) => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleWeekday(day)}
                                className={`min-w-[2.5rem] px-2 py-2 rounded-xl text-xs font-bold border transition-all ${
                                    v.weekdays.includes(day)
                                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200'
                                }`}
                            >
                                {t(`scheduler.weekday_${day}` as const)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {v.scheduleType === 'monthly' && (
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.month_days')}</label>
                    <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {MONTH_DAY_NUMBERS.map((day) => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleMonthDay(day)}
                                className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                    v.monthDays.includes(day)
                                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200'
                                }`}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {v.scheduleType === 'interval_days' && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.interval_days')}</label>
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={v.intervalDays}
                            onChange={(e) => onChange({ intervalDays: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            className="w-full max-w-xs p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.interval_anchor')}</label>
                        <input
                            type="date"
                            value={v.intervalAnchorDate}
                            onChange={(e) => onChange({ intervalAnchorDate: e.target.value })}
                            className="w-full max-w-xs p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                        />
                        <p className="mt-2 text-xs text-gray-500">{t('scheduler.interval_anchor_desc')}</p>
                    </div>
                </div>
            )}

            {v.scheduleType === 'custom' && (
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.custom_cron')}</label>
                    <input
                        type="text"
                        value={v.customCron}
                        onChange={(e) => onChange({ customCron: e.target.value })}
                        placeholder="0 8 * * *"
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                    />
                    <p className="mt-2 text-xs text-gray-500">{t('scheduler.custom_cron_desc')}</p>
                </div>
            )}
        </div>
    );
}
