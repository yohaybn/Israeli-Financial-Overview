import type {
    BackupScheduleConfig,
    CronScheduleFields,
    InsightRulesScheduleConfig,
    SchedulerConfig,
    SchedulerScheduleType
} from './types.js';

export function parseRunTimeFromCron(cronExpression: string): string {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 2) return '08:00';
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    if (Number.isNaN(minute) || Number.isNaN(hour)) return '08:00';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function cronPartsFromRunTime(runTime: string): { minute: number; hour: number } {
    const [h, m] = runTime.split(':').map((x) => parseInt(x, 10));
    const hour = Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8;
    const minute = Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0;
    return { minute, hour };
}

/** Today in local date as YYYY-MM-DD */
export function localDateISO(d: Date = new Date()): string {
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function startOfLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDateOnly(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return null;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const dt = new Date(y, mo, day);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== day) return null;
    return dt;
}

/**
 * Run on anchor, anchor+N, anchor+2N... (calendar days, server local timezone).
 */
export function intervalDaysShouldRun(anchorDate: string, intervalDays: number, now: Date = new Date()): boolean {
    const n = Math.max(1, Math.floor(intervalDays));
    const anchor = parseLocalDateOnly(anchorDate);
    if (!anchor) return false;
    const today = startOfLocalDay(now);
    const diffMs = today.getTime() - startOfLocalDay(anchor).getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 0) return false;
    return diffDays % n === 0;
}

function inferScheduleTypeFromCron(cronExpression: string): {
    type: SchedulerScheduleType;
    weekdays?: number[];
    monthDays?: number[];
} {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return { type: 'custom' };
    const [, , dom, mon, dow] = parts;
    const isDaily = dom === '*' && mon === '*' && dow === '*';
    if (isDaily) return { type: 'daily' };

    const isMonthly = dom !== '*' && mon === '*' && dow === '*';
    if (isMonthly) {
        if (dom.includes('-') || dom.includes('/')) return { type: 'custom' };
        const days = dom
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => n >= 1 && n <= 31);
        if (days.length) return { type: 'monthly', monthDays: [...new Set(days)].sort((a, b) => a - b) };
    }

    const isWeekly = dom === '*' && mon === '*' && dow !== '*';
    if (isWeekly) {
        if (dow.includes('-') || dow.includes('/')) return { type: 'custom' };
        const days = dow
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => n >= 0 && n <= 7)
            .map((n) => (n === 7 ? 0 : n));
        const uniq = [...new Set(days)].sort((a, b) => a - b);
        if (uniq.length) return { type: 'weekly', weekdays: uniq };
    }

    return { type: 'custom' };
}

function normalizeScheduleFields(
    fields: Partial<CronScheduleFields> & { cronExpression?: string },
    defaultCron: string
): CronScheduleFields {
    const cronExpression = fields.cronExpression?.trim() || defaultCron;
    const inferred = inferScheduleTypeFromCron(cronExpression);
    const scheduleType: SchedulerScheduleType = fields.scheduleType ?? inferred.type;

    const runTime = fields.runTime ?? parseRunTimeFromCron(cronExpression);

    let weekdays = fields.weekdays?.length
        ? [...new Set(fields.weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
        : undefined;
    if (scheduleType === 'weekly' && (!weekdays || !weekdays.length)) {
        weekdays = inferred.weekdays?.length ? inferred.weekdays : [1];
    }

    let monthDays = fields.monthDays?.length
        ? [...new Set(fields.monthDays)].filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b)
        : undefined;
    if (scheduleType === 'monthly' && (!monthDays || !monthDays.length)) {
        monthDays = inferred.monthDays?.length ? inferred.monthDays : [1];
    }

    const intervalDays =
        scheduleType === 'interval_days' ? Math.max(1, fields.intervalDays ?? 3) : fields.intervalDays;
    let intervalAnchorDate = fields.intervalAnchorDate;
    if (scheduleType === 'interval_days') {
        intervalAnchorDate =
            intervalAnchorDate && parseLocalDateOnly(intervalAnchorDate) ? intervalAnchorDate : localDateISO();
    }

    const built = buildCronFromScheduleFields({
        scheduleType,
        runTime,
        weekdays,
        monthDays,
        intervalDays,
        intervalAnchorDate,
        cronExpression
    });

    return {
        cronExpression: built,
        scheduleType,
        runTime,
        weekdays,
        monthDays,
        intervalDays,
        intervalAnchorDate
    };
}

/**
 * Ensures scheduleType, runTime, and mode-specific fields are populated (migration + defaults).
 */
export function normalizeSchedulerConfig<T extends SchedulerConfig>(config: T): T {
    const normalized = normalizeScheduleFields(
        {
            scheduleType: config.scheduleType,
            runTime: config.runTime,
            weekdays: config.weekdays,
            monthDays: config.monthDays,
            intervalDays: config.intervalDays,
            intervalAnchorDate: config.intervalAnchorDate,
            cronExpression: config.cronExpression
        },
        '0 8 * * *'
    );

    return {
        ...config,
        ...normalized
    } as T;
}

export function normalizeBackupSchedule<T extends BackupScheduleConfig>(config: T): T {
    const normalized = normalizeScheduleFields(
        {
            scheduleType: config.scheduleType,
            runTime: config.runTime,
            weekdays: config.weekdays,
            monthDays: config.monthDays,
            intervalDays: config.intervalDays,
            intervalAnchorDate: config.intervalAnchorDate,
            cronExpression: config.cronExpression
        },
        '0 9 * * *'
    );

    return {
        ...config,
        ...normalized,
        enabled: config.enabled ?? false,
        destination: config.destination ?? 'local',
        lastRun: config.lastRun
    } as T;
}

export function normalizeInsightRulesSchedule<T extends InsightRulesScheduleConfig>(config: T): T {
    const normalized = normalizeScheduleFields(
        {
            scheduleType: config.scheduleType,
            runTime: config.runTime,
            weekdays: config.weekdays,
            monthDays: config.monthDays,
            intervalDays: config.intervalDays,
            intervalAnchorDate: config.intervalAnchorDate,
            cronExpression: config.cronExpression
        },
        '0 10 * * *'
    );

    return {
        ...config,
        ...normalized,
        enabled: config.enabled ?? false,
        lastRun: config.lastRun
    } as T;
}

export function buildCronFromScheduleFields(config: CronScheduleFields): string {
    const type: SchedulerScheduleType = config.scheduleType ?? 'daily';
    const { minute, hour } = cronPartsFromRunTime(config.runTime ?? parseRunTimeFromCron(config.cronExpression));

    if (type === 'custom') {
        return config.cronExpression.trim() || `${minute} ${hour} * * *`;
    }
    if (type === 'daily') {
        return `${minute} ${hour} * * *`;
    }
    if (type === 'weekly') {
        const raw = (config.weekdays?.length ? config.weekdays : [1]).filter((d) => d >= 0 && d <= 6);
        const uniq = [...new Set(raw.length ? raw : [1])].sort((a, b) => a - b);
        return `${minute} ${hour} * * ${uniq.join(',')}`;
    }
    if (type === 'monthly') {
        const dom = (config.monthDays?.length ? config.monthDays : [1])
            .filter((d) => d >= 1 && d <= 31)
            .sort((a, b) => a - b);
        const uniq = [...new Set(dom.length ? dom : [1])];
        return `${minute} ${hour} ${uniq.join(',')} * *`;
    }
    if (type === 'interval_days') {
        return `${minute} ${hour} * * *`;
    }
    return `${minute} ${hour} * * *`;
}

export function buildSchedulerCronExpression(config: SchedulerConfig): string {
    return buildCronFromScheduleFields(config);
}
